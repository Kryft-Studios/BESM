# BESM [Bloxd Scripting Environment Modules | Bloxd ESM]

# How to use

1. Use your preferred package manager to download `bloxd-esm` on npm.
e.g.: `pnpm add -D bloxd-esm`

2. Once installed, do:
```bash
bloxd-esm init
```

3. To build, use:
```bash
bloxd-esm build
```

# Hooks

There are **3** Hooks in BESM:

1. The `on-player-load.js`: What happens when the player joins
2. The `on-player-already-loaded.js`: Decide what happens if the player has already loaded.
3. The `world-code.js`

# Included
- Module Loading
- Import/export
- Dependency resolution
- Compilation to Bloxd World Code + code blocks
- Build CLI
- Init CLI
- Basic Error Messages
- Documentation

# Not included yet
- Async/ await/ promises
- .bmp (BESM Module Package)
- Deep Error validation
- TS Support

# Errors
1. `Circular Dependency`
2. `Failed to parse [babel]`
3. `Config not found`
4. `Failed to minify [terser]`