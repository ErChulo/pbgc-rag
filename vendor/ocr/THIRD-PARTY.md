# Compiled OCR dependency notices

The verified tesseract.js-core 6.0.0 npm release corresponds to source revision `8135c61fadee753821cb6a9916e17e1309a6bbf7` in `naptha/tesseract.js-core` (tag v6.0.0). The exact gitlinks below were read from `git ls-tree HEAD:third_party` at that revision. The core WASM may include these dependencies; their notices are preserved in `third-party-licenses/` even though this adapter uses only direct raw-RGBA recognition, not their image-file decoders.

| Dependency | Source revision | Retained notice |
| --- | --- | --- |
| Leptonica | 4af068b56a9674da915debea4ed7e1b9885b17e8 | leptonica-BSD.txt |
| giflib | fa37672085ce4b3d62c51627ab3c8cf2dda8009a | giflib-MIT.txt |
| Independent JPEG Group libjpeg | 6c0fcb8ddee365e7abc4d332662b06900612e923 | libjpeg-README.txt |
| libpng | a37d4836519517bdce6cb9d956092321eca3e73b | libpng-LICENSE.txt |
| libtiff | b51bb157123264e26d34c09cc673d213aea61fc7 | libtiff-COPYRIGHT.txt |
| libwebp | 20ef03ee351d4ff03fc5ff3ec4804a879d1b9d5c | libwebp-COPYING.txt and libwebp-PATENTS.txt |
| openlibm | ae2d91698508701c83cab83714d42a1146dccf85 | openlibm-LICENSE.txt |
| Tesseract fork | 5a21eebeacd77dd181eec17317de7e3a20b7b9fb | libtesseract-LICENSE.txt |
| zlib | 21767c654d31d2dccdde4330529775c6c5fd5389 | zlib-README.txt |

Portions of this software are based in part on the work of the Independent JPEG Group. See the retained original README for its complete terms. Leptonica and openlibm retain their BSD notices, giflib its MIT notice, and libpng/libtiff/libwebp/zlib their original licenses. The wrapper/runtime and English traineddata are Apache-2.0. This is a provenance/license inventory, not a claim of comprehensive vulnerability certification.
