all: index.html

clean:
	rm -f index.html

index.html: index.md template.html Makefile
	pandoc --toc -s --css reset.css --css index.css -i $< -o $@ --template=template.html
	mkdir -p output
	cp index.html reset.css index.css fouineur-shot.avif fouineur-shot.jpg icon2x.png ../docs-output

.PHONY: all clean
