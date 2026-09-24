---
title: "Two Knights"
pubDate: 2026-09-23
description: "Solving the CSES Two Knights problem using a pattern of triangular numbers, then working backwards to explain the official solution."
---

I decided to start tackling some CSES problems recently to refresh my memory on
data structures and algorithmic design in preparation for technical interviews. 
One I solved recently was [Two Knights](https://cses.fi/problemset/model/1072/),
and I found (in my opinion) a pretty satisfying solution. After looking
at the analysis I was confused to see a different explanation of the problem,
so I worked backwards to connect the two.

This blog post serves a few purposes: to practice explaining my work, 
test out $\LaTeX$ rendering, which I just added to this site, and procrastinate
studying for my graph theory midterm 😸.

## The Problem

We need to count for $k = 1, 2, \dots, n$ the number of ways two knights can be
placed on a $k \times k$ chessboard such that they do not attack each other.

For $k = 1$ this is trivially $0$, but what about for higher values?
My immediate instinct here was combinatorics. For $k = 2$, we have a
$2 \times 2$ chess board. There's no way the knights can attack each other on a
board this small, so we just need to figure out how many different
ways we can place two pieces in four squares. Simple: $4$ choose $2$.

It isn't as simple as this for every case. As $k$ grows, our solution gets farther
away from just $k^2$ choose $2$, but it's actually a consistent pattern:

$$
\begin{align*}
    k=3 &\Rightarrow \binom{9}{2}  - 8 \\[1em]
    k=4 &\Rightarrow \binom{16}{2} - 24 & &\color{gray}(+16) \\[1em]
    k=5 &\Rightarrow \binom{25}{2} - 48 & &\color{gray}(+24) \\[1em]
    k=6 &\Rightarrow \binom{36}{2} - 80 & &\color{gray}(+32)
\end{align*}
$$

So it seems like for $k \ge 3$, we are subtracting a new multiple of $8$ from the
result of our $k^2$ choose $2$. Specifically, each time we subtract $8(k - 2)$ more
than the previous case. Adding those up, we subtract a total of
$8 \cdot (1 + 2 + \dots + (k-2))$... this is just $8$ times a triangular number!

We can simplify this further by identifying a closed form. Since the $m$th
triangular number is $\frac{m(m+1)}{2}$, the closed form is
$8 \cdot \frac{(k-2)(k-1)}{2} = 4(k-1)(k-2)$.

This represents the number of ways to place two
knights that *do* attack each other. Two attacking knights always sit in opposite
corners of a $2 \times 3$ or $3 \times 2$ rectangle:

<figure class="diagram">
<svg viewBox="0 0 260 120" width="260" height="120" role="img" aria-label="A 2 by 3 and a 3 by 2 rectangle of squares. In each, knights on opposite corners are connected by lines, showing the two attacking pairs per rectangle.">
  <g fill="currentColor" fill-opacity="0.12">
    <rect x="0" y="20" width="40" height="40"/><rect x="80" y="20" width="40" height="40"/><rect x="40" y="60" width="40" height="40"/>
    <rect x="180" y="0" width="40" height="40"/><rect x="220" y="40" width="40" height="40"/><rect x="180" y="80" width="40" height="40"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5">
    <rect x="0.5" y="20.5" width="119" height="79"/>
    <rect x="180.5" y="0.5" width="79" height="119"/>
  </g>
  <g stroke="currentColor" stroke-width="1.5" stroke-opacity="0.6">
    <line x1="20" y1="40" x2="100" y2="80"/><line x1="200" y1="20" x2="240" y2="100"/>
    <line x1="100" y1="40" x2="20" y2="80" stroke-dasharray="4 3"/><line x1="240" y1="20" x2="200" y2="100" stroke-dasharray="4 3"/>
  </g>
  <g fill="currentColor" font-size="28" text-anchor="middle" dominant-baseline="central">
    <text x="20" y="40">♞&#xFE0E;</text><text x="100" y="80">♞&#xFE0E;</text>
    <text x="100" y="40">♘&#xFE0E;</text><text x="20" y="80">♘&#xFE0E;</text>
    <text x="200" y="20">♞&#xFE0E;</text><text x="240" y="100">♞&#xFE0E;</text>
    <text x="240" y="20">♘&#xFE0E;</text><text x="200" y="100">♘&#xFE0E;</text>
  </g>
</svg>
<figcaption>Seems like Claude can make chessboards at least as good as it can make <a href="https://simonwillison.net/tags/pelican-riding-a-bicycle/">pelicans riding bicycles</a>.</figcaption>
</figure>

Every attacking pair belongs to exactly one of these rectangles. On a $k \times k$
board, a $2 \times 3$ rectangle fits in $k - 1$ vertical positions and $k - 2$
horizontal ones, and a $3 \times 2$ rectangle is the same turned sideways. That
ends up being $(k-1)(k-2)$ rectangles of each shape, with $2$ attacking pairs each:

$$
2 \cdot 2 \cdot (k-1)(k-2) = 4(k-1)(k-2)
$$

This also explains why $k \le 2$ was so simple: a $2 \times 3$ rectangle doesn't
fit on the board in the first place.

## Implementation

Writing the math so far out directly in code is a nice and short solution:
```cpp
for (uint64_t k = 1; k <= n; k++) {
    uint64_t board_size = k * k;
    uint64_t value = (board_size * (board_size - 1)) / 2;
    value -= 4 * (k - 1) * (k - 2);

    std::cout << value << '\n';
}
```

So how did CSES solve it?
```cpp
for (uint64_t k = 1; k <= n; k++) {
    std::cout << (k * k * k * k - 9 * k * k + 24 * k - 16) / 2 << "\n";
}
```

Not a super descriptive or (very subjectively) "pretty" solution like mine.
But we can get there by combining a few parts of the earlier math:
$$
\begin{align*}
    &\frac{k^2(k^2 - 1)}{2} \space - \space 4(k-2)(k-1) \\[1em]
    = \space &\frac{k^2(k^2-1)}{2} \space - \space \frac{8(k-2)(k-1)}{2} \\[1em]
    = \space &\frac{k^4 - k^2 - 8(k^2 - 3k + 2)}{2} \\[1em]
    = \space &\frac{k^4 - k^2 - 8k^2 + 24k - 16}{2} \\[1em]
    = \space &\frac{k^4 - 9k^2 + 24k - 16}{2}
\end{align*}
$$

Same equation, just in different fonts.