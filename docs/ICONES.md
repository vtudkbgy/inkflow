# Icônes d'InkFlow

## Jeu d'icônes

InkFlow utilise **Feather** (https://feathericons.com, licence MIT, voir plus bas).
C'est le seul jeu autorisé dans l'interface.

## Règles

- Copier le tracé SVG d'une icône Feather tel quel, en SVG inline dans
  `index.html` (ou dans le `innerHTML` d'un composant JS) : `viewBox="0 0 24 24"`,
  `fill="none"`, `stroke="currentColor"`, `stroke-linecap="round"`,
  `stroke-linejoin="round"`, `aria-hidden="true"`. Taille et épaisseur
  (`stroke-width` 1,8 à 2,2) suivent les boutons voisins.
- Jamais de chargement depuis un CDN, jamais de bibliothèque d'icônes ajoutée
  au projet (`feather-icons`, `lucide`…) : les tracés sont copiés.
- Pas d'icône dessinée à la main, pas d'emoji ni de caractère Unicode (★, ⧉,
  ✨, ✕…) en guise d'icône. Si Feather n'a pas l'icône voulue, utiliser un
  libellé texte.
- Changer de jeu d'icônes est une décision de Nath.

## À reprendre

Quelques boutons anciens utilisent encore des caractères Unicode (★, ⧉, ✨, ✕
dans les barres du lasso, les en-têtes de modales, la recherche PDF) ou des
tracés proches de Feather sans l'être exactement. À remplacer par l'icône
Feather correspondante (`star`, `copy`, `x`, `chevron-up`/`chevron-down`…)
quand on touche ces zones.

## Licence de Feather

```
The MIT License (MIT)

Copyright (c) 2013-2017 Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
