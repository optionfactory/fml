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
publish: build
	npm publish --access public
