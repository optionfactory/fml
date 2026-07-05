import { Base64 } from "./encodings.mjs";
import { SessionStorage } from "./storage.mjs";


class AuthorizationCodeFlow {
    static forKeycloak(clientId, realmBaseUrl, redirectUri, maybeScope) {
        const scope = maybeScope ?? "openid profile";
        return new AuthorizationCodeFlow(clientId, scope, {
            auth: new URL("protocol/openid-connect/auth", realmBaseUrl),
            token: new URL("protocol/openid-connect/token", realmBaseUrl),
            logout: new URL("protocol/openid-connect/logout", realmBaseUrl),
            registration: new URL("protocol/openid-connect/registrations", realmBaseUrl),
            redirect: redirectUri
        });
    }
    constructor(clientId, scope, { auth, token, registration, logout, redirect }) {
        this.clientId = clientId;
        this.scope = scope;
        this.uri = { auth, token, registration, logout, redirect };
    }
    async action(uri, additionalParams) {
        const pkceVerifier = Base64.encode(crypto.getRandomValues(new Uint8Array(32)).buffer);
        const pkceChallenge = Base64.encode(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pkceVerifier)));
        const state = this.clientId + Base64.encode(crypto.getRandomValues(new Uint8Array(16)).buffer);
        SessionStorage.save(`${AuthorizationCodeFlow.PKCE_AND_STATE_KEY}-${this.clientId}`, {
            state: state,
            verifier: pkceVerifier
        });
        const url = new URL(uri);
        url.searchParams.set("client_id", this.clientId);
        url.searchParams.set("redirect_uri", this.uri.redirect);
        url.searchParams.set("response_type", 'code');
        url.searchParams.set("scope", this.scope);
        url.searchParams.set("state", state);
        url.searchParams.set("code_challenge", pkceChallenge);
        url.searchParams.set("code_challenge_method", 'S256');
        Object.entries(additionalParams || {}).forEach(kv => {
            url.searchParams.set(kv[0], kv[1]);
        });
        window.location.href = url.toString();
    }
    async registration(additionalParams) {
        await this.action(this.uri.registration, additionalParams);
    }
    async applicationInitiatedAction(kcAction, additionalParams) {
        await this.action(this.uri.auth, {
            ...additionalParams,
            kc_action: kcAction,
        });
    }
    async #tokenExchange(code, state) {
        window.history.replaceState('', "", this.uri.redirect);
        const stateAndVerifier = SessionStorage.pop(`${AuthorizationCodeFlow.PKCE_AND_STATE_KEY}-${this.clientId}`);
        if (stateAndVerifier.state !== state) {
            throw new Error("State mismatch");
        }
        const response = await fetch(this.uri.token, {
            method: "POST",
            headers: {
                "Content-Type": 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams([
                ["client_id", this.clientId],
                ["code", code],
                ["grant_type", "authorization_code"],
                ["code_verifier", stateAndVerifier.verifier],
                ["state", stateAndVerifier.state],
                ["redirect_uri", this.uri.redirect]
            ])
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error("Error:" + response.status + ": " + text);
        }
        const token = await response.json();
        return new AuthorizationCodeFlowSession(this.clientId, token, this.uri);
    }
    async ensureLoggedIn() {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        if (code && SessionStorage.load(`${AuthorizationCodeFlow.PKCE_AND_STATE_KEY}-${this.clientId}`)) {
            //if callback from keycloak and we have our state still stored
            const state = url.searchParams.get("state");
            return await this.#tokenExchange(code, state);
        }
        //if not authorized
        await this.action(this.uri.auth, {});
        return null;
    }
}
AuthorizationCodeFlow.PKCE_AND_STATE_KEY = "state-and-verifier";

class AuthorizationCodeFlowSession {
    static parseToken(token) {
        const [rawHeader, rawPayload, signature] = token.split(".");
        const utf8decoder = new TextDecoder("utf-8");
        return {
            header: JSON.parse(utf8decoder.decode(Base64.decode(rawHeader, Base64.STANDARD))),
            payload: JSON.parse(utf8decoder.decode(Base64.decode(rawPayload, Base64.STANDARD))),
            signature: signature
        };
    }
    constructor(clientId, t, { token, logout, redirect }) {
        this.clientId = clientId;
        this.token = t;
        this.idToken = AuthorizationCodeFlowSession.parseToken(t.id_token);
        this.accessToken = AuthorizationCodeFlowSession.parseToken(t.access_token);
        this.refreshToken = AuthorizationCodeFlowSession.parseToken(t.refresh_token);
        this.uri = { token, logout, redirect }
        this.refreshCallback = null;
    }
    onRefresh(callback) {
        this.refreshCallback = callback;
    }
    async refresh() {
        const response = await fetch(this.uri.token, {
            method: "POST",
            headers: {
                "Content-Type": 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams([
                ["client_id", this.clientId],
                ["grant_type", "refresh_token"],
                ["refresh_token", this.token.refresh_token]
            ])
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error("Error:" + response.status + ": " + text);
        }
        const token = await response.json();
        this.token = token;
        this.idToken = AuthorizationCodeFlowSession.parseToken(token.id_token);
        this.accessToken = AuthorizationCodeFlowSession.parseToken(token.access_token);
        this.refreshToken = AuthorizationCodeFlowSession.parseToken(token.refresh_token);
        if (this.refreshCallback) {
            this.refreshCallback(this.token, this.accessToken, this.refreshToken);
        }
    }
    shouldBeRefreshed(gracePeriod) {
        const now = new Date().getTime();
        const refreshTokenExpiresAt = this.refreshToken.payload.exp * 1000;
        const expired = now > refreshTokenExpiresAt;
        const shouldRefresh = now - gracePeriod > refreshTokenExpiresAt;
        return !expired && shouldRefresh;
    }
    async refreshIf(gracePeriod) {
        if (!this.shouldBeRefreshed(gracePeriod)) {
            return;
        }
        await this.refresh();
    }
    logout() {
        const url = new URL(this.uri.logout);
        url.searchParams.set("post_logout_redirect_uri", this.uri.redirect);
        url.searchParams.set("id_token_hint", this.token.id_token);
        window.location.href = url.toString();
    }

    bearerToken() {
        return `Bearer ${this.token.access_token}`;
    }

    interceptor(gracePeriodBefore, gracePeriodAfter) {
        return new AuthorizationCodeFlowInterceptor(this, gracePeriodBefore, gracePeriodAfter);
    }
}

class AuthorizationCodeFlowInterceptor {
    #session;
    #gracePeriodBefore;
    #gracePeriodAfter;
    constructor(session, gracePeriodBefore, gracePeriodAfter) {
        this.#session = session;
        this.#gracePeriodBefore = gracePeriodBefore || 2000;
        this.#gracePeriodAfter = gracePeriodAfter || 30000;
    }
    async intercept(url, request, chain) {
        await this.#session.refreshIf(this.#gracePeriodBefore);
        request.headers.set("Authorization", this.#session.bearerToken());
        const response = await chain.proceed(url, request);
        await this.#session.refreshIf(this.#gracePeriodAfter);
        return response;
    }
}

export { AuthorizationCodeFlow, AuthorizationCodeFlowSession, AuthorizationCodeFlowInterceptor };