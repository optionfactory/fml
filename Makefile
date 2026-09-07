.PHONY: build initialize test check publish clean clean-deps

build:
	npm run initialize
	npm run build

initialize:
	npm run initialize
test: build
	npm run test
check:
	npm run lint
	npm run check
publish: check test
	@git diff --quiet HEAD || { echo "refusing to publish: the working tree is dirty"; exit 1; }
	@test -z "$$(git ls-files --others --exclude-standard)" || { echo "refusing to publish: there are untracked files"; exit 1; }
	@if git rev-parse --abbrev-ref @{u} >/dev/null 2>&1; then \
		git diff --quiet @{u} HEAD || { echo "refusing to publish: the branch diverged from its upstream"; exit 1; }; \
	fi
	@version=$$(node -p "require('./package.json').version"); \
		case "$$version" in *-dev) echo "refusing to publish a development version: $$version"; exit 1;; esac
	@version=$$(node -p "require('./package.json').version"); \
		if git rev-parse -q --verify "refs/tags/v$$version" >/dev/null; then \
			echo "refusing to publish: v$$version is already tagged"; exit 1; \
		fi; \
		git tag -a "v$$version" -m "version $$version" || exit 1; \
		if ! npm publish --access public; then \
			git tag -d "v$$version"; \
			echo "publish failed: the tag was rolled back"; exit 1; \
		fi; \
		echo "published v$$version: push the tag with git push origin v$$version"
clean:
	npm run clean
clean-deps:
	npm run clean:deps
