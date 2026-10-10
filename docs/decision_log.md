# Implementation decisions

React 19, Three.js, React Three Fiber and Vite 8 were pinned to exact tested versions. Node 22.23.3 is pinned. ObsPy 1.5.0 was selected because the older 1.4.2 environment was incompatible with the local Python 3.13 dependency set. Scientific method remains IASP91.

A local canvas texture generated from Natural Earth polygons fills land; local coastline geometry and an ocean sphere preserve the requested visual direction without remote imagery. Marker geometry is instanced. Responsive side panels use visible tab selection rather than modal dialogs; no modal focus trap is needed for those nonmodal regions.

Continuous grid candidate cells passed the error threshold without refinement. Cells with phase/branch/missing-data discontinuities are conservatively rejected. This limitation is visible in the UI and explained in science documentation.

Desktop automated browsers and mobile emulation are distinct from physical-device acceptance. Unperformed physical-device or previous-stable tests are never marked passed.
