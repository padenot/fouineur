all: output/index.html

clean:
	rm -r output/*

output/index.html: index.md template.html Makefile index.css
	pandoc --toc-depth=1 --toc -s --css reset.css --css index.css -i $< -o $@ --template=template.html
	mkdir -p output
	cp reset.css index.css fouineur-shot.avif fouineur-shot.jpg icon2x.png output/

.PHONY: all clean
