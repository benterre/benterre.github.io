# Browser bundle third-party notices

`parquet_bundle.js` incorporates the following MIT-licensed software. These
notices accompany the bundle, including its local Parquet-reading features.

- **hyparquet 1.29.2**, by Hyperparam. The bundled package's `LICENSE` contains
  the MIT permission/disclaimer below without a separate copyright line.
- **fzstd 0.1.1**: Copyright (c) 2020 Arjun Barrett.
- **snappyjs-derived decoder**, included in hyparquet:
  Copyright (c) 2016 Zhipeng Jia.

## MIT License

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

## External browser libraries

MathJax, Three.js and 3d-force-graph are loaded from the CDN URLs configured in
`index.html`, not copied into the four local runtime assets. Their distributions
retain their own notices. No database files are included in the browser bundle.
