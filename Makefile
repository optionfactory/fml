.PHONY: build initialize test check publish clean clean-deps

build:
	npm run initialize
	npm run build

initialize:
	npm run initialize
	npx playwright install chromium
test: build
	npm run test
check:
	npm run check
publish: check test
	@git diff --quiet HEAD || { echo "refusing to publish: the working tree is dirty"; exit 1; }
	@version=$$(node -p "require('./package.json').version"); \
		case "$$version" in *-dev) echo "refusing to publish a development version: $$version"; exit 1;; esac
	npm publish --access public
	@version=$$(node -p "require('./package.json').version"); \
		git tag -a "v$$version" -m "version $$version" && echo "tagged v$$version"
clean:
	npm run clean
clean-deps:
	npm run clean:deps
