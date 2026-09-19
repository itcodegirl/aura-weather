# Font licences

Both faces in this directory are licensed under the SIL Open Font
License, Version 1.1 (<https://scripts.sil.org/OFL>). Neither is
modified beyond subsetting, which the licence permits; the OFL's
reserved-font-name terms are respected because the subsets keep the
upstream family names and are not renamed.

## Inter

`Inter-Variable.woff2` — Copyright (c) 2016 The Inter Project Authors
(<https://github.com/rsms/inter>). Variable face, weights 100–900,
latin subset. Aura's primary UI typeface.

## IBM Plex Mono

`IBMPlexMono-Regular.woff2`, `IBMPlexMono-Medium.woff2`,
`IBMPlexMono-SemiBold.woff2` — Copyright (c) 2017 IBM Corp.
(<https://github.com/IBM/plex>). Weights 400, 500 and 600, subset from
the upstream latin files to the ranges Aura's instrument role uses:
basic latin, Latin-1 Supplement, Latin Extended-A, and the handful of
punctuation and arrow codepoints the readouts need. Hinting and the
GSUB/GPOS tables are dropped — a monospaced face needs neither kerning
nor tabular-figure substitution, since every glyph is already one
advance wide.

Aura uses this face for measured values and their labels only: numerals,
units, field keys, module headers and status words. Running prose stays
in Inter.
