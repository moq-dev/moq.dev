{
  description = "moq.dev - the blog, moq.pub, and moq.watch";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      nixpkgs,
      flake-utils,
      ...
    }:
    flake-utils.lib.eachSystem
      [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ]
      (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          devShells.default =
            assert pkgs.lib.assertMsg
              ((builtins.fromJSON (builtins.readFile ./package.json)).packageManager == "bun@${pkgs.bun.version}")
              "Update package.json to match Nix Bun ${pkgs.bun.version}";
            assert pkgs.lib.assertMsg
              (pkgs.lib.hasPrefix "FROM oven/bun:${pkgs.bun.version}-slim AS base\n" (builtins.readFile ./Dockerfile))
              "Update Dockerfile to match Nix Bun ${pkgs.bun.version}";
            pkgs.mkShell (
              {
                packages = with pkgs; [
                  # Everything in the justfile runs through bun: astro, vite, biome,
                  # tsc, and wrangler are all `bun run` or `bunx`.
                  #
                  # Keep package.json and Dockerfile aligned when nixpkgs changes
                  # Bun. CI reads package.json and evaluates the assertions above.
                  bun

                  # Astro and Vite target node, and parts of their toolchains shell
                  # out to it rather than to bun.
                  nodejs_24

                  # The task runner every recipe in the justfile is written for.
                  just
                ];

                # `just cards` imports Playwright from here rather than node_modules,
                # so the library and its browsers come from the same nixpkgs pin.
                PLAYWRIGHT_NODE_PATH = "${pkgs.playwright-test}/lib/node_modules";
                PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
              }
              # Chromium only, and skip Playwright's host check: it ldd-checks
              # the host even when the Nix browser runs fine. Not
              # `browsers-chromium`, which drops chromium-headless-shell, the
              # binary headless launches resolve to.
              // pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
                PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers.override {
                  withFirefox = false;
                  withWebkit = false;
                };
                PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
              }
            );

          formatter = pkgs.nixfmt-tree;
        }
      );
}
