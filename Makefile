ignored = data2.js data.js index.html LICENSE Makefile node_modules package.json package-lock.json publish.sh README.md src/ tsconfig.json vite.config.js signed

dist/main.js: src/main.ts
	npm run build

build: dist/main.js
	web-ext build --ignore-files $(ignored) --overwrite-dest

publish: dist/main.js
	echo ${AMO_JWT_ISSUER}
	web-ext sign --api-key=${AMO_JWT_ISSUER} --api-secret=${AMO_JWT_SECRET} --channel=listed --ignore-files $(ignored) "dist/main.js.map" ----amo-metadata=metadata.json
