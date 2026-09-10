SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
.ONESHELL:
.PHONY: build initialize test check publish clean clean-deps

build: initialize
	npm run build

initialize:
	npm run initialize

test:
	npm run test

check:
	npm run lint
	npm run check

publish:
	@die() { echo "refusing to publish: $$*" >&2; exit 1; }
	test -z "$$(git status --porcelain)" || die "the working tree is not clean"
	if git rev-parse '@{u}' >/dev/null 2>&1; then
		git diff --quiet '@{u}' HEAD || die "the branch diverged from its upstream"
	fi
	version=$$(node -p "require('./package.json').version")
	echo "$$version" | grep -Eq -- '^[0-9]+\.[0-9]+\.[0-9]+(-rc[0-9]+)?$$' ||
		die "$$version is neither a release (x.y.z) nor a release candidate (x.y.z-rcN)"
	case "$$version" in *-rc*) dist_tag="rc";; *) dist_tag="latest";; esac
	! git rev-parse -q --verify "refs/tags/v$$version" >/dev/null || die "v$$version is already tagged"
	git tag -a "v$$version" -m "version $$version"
	if ! npm publish --access public --tag "$$dist_tag"; then
		git tag -d "v$$version"
		echo "publish failed: the tag was rolled back" >&2
		exit 1
	fi
	echo "published v$$version under the '$$dist_tag' dist-tag: push the tag with git push origin v$$version"

clean:
	npm run clean

clean-deps:
	npm run clean:deps
