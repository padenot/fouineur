all: output/index.html

clean:
	rm -r output/*

output/index.html: index.md template.html Makefile index.css
	mkdir -p output
	pandoc --toc-depth=1 --toc -s --css reset.css --css index.css -i $< -o $@ --template=template.html
	cp *.woff2 reset.css index.css fouineur-shot.avif fouineur-shot.jpg icon2x.png output/

.PHONY: all clean
