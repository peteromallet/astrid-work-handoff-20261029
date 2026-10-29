# pixel.sprites

Pass one generated image handle. The executor detects its square drawn cell or
uses `block`, snaps at that density, removes the background with cutout's
`chroma`, `flat`, or `luma` mode, and splits either connected pieces or a regular
`cells: "4x2"` sheet. `merge_distance` joins nearby detached details. The
`sprites` output is ordered row-major; `preview` labels indices, and `report`
records source boxes, native and on-screen sizes at `scale`, and the dark
alpha-boundary fraction. Each piece is sampled from its own source crop; within
4% of its detected cell size, sampling may move to preserve a materially more
complete dark outline. The report distinguishes `drawn_block` from
`sampling_block` and warns about inconsistent density across pieces. `padding`
is in native cells.

Do not choose `block` to force a smaller on-screen sprite. Draw the target
number of art pixels when generating, then keep one integer timeline scale.
