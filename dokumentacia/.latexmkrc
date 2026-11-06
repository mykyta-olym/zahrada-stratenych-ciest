# Preklad dokumentácie: latexmk (tri samostatné dokumenty podľa pokynov k zadaniu)
# Výsledné PDF sú v priečinku dist/, pomocné súbory v build/.

$out_dir  = 'dist';
$aux_dir  = 'build';

$pdf_mode = 5;                   # XeLaTeX (písma OpenType, slovenčina cez polyglossia)
$xelatex  = 'xelatex %O %S';
$bibtex_use = 2;                 # zoznam literatúry pripraví biber (biblatex, norma ISO 690)

@default_files = ('pouzivatelska-prirucka.tex', 'systemova-prirucka.tex', 'zdrojove-texty.tex');
