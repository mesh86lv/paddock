{
  description = "Bubblewrap and pasta sandbox for the pi coding agent";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f (import nixpkgs { inherit system; }));
    in
    {
      # Home Manager module. Import as:
      #   imports = [ inputs.pi-agent-sandbox.homeManagerModules.default ];
      #
      # Nix warns "unknown flake output 'homeManagerModules'" because this
      # output is not part of the standard flake schema. It is a harmless
      # warning — Home Manager reads it. Everyone shipping HM modules
      # through a flake sees it.
      homeManagerModules = {
        default = import ./modules/ai-agent.nix;
        pi-agent-sandbox = import ./modules/ai-agent.nix;
      };

      # Standalone derivations, built without the module system:
      #   nix build github:USER/pi-agent-sandbox#ai_agent
      #   nix build github:USER/pi-agent-sandbox#ai_worktree
      packages = forAllSystems (
        pkgs:
        let
          aiAgent = import ./lib/wrapper.nix { inherit pkgs; };
          ai_worktree = import ./lib/worktree.nix { inherit pkgs aiAgent; };
        in
        {
          default = aiAgent;
          ai_agent = aiAgent;
          ai_worktree = ai_worktree;
        }
      );
    };
}
