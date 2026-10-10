{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.programs.pi-agent-sandbox;

  aiAgent = import ../lib/wrapper.nix {
    inherit pkgs lib;
    inherit (cfg) herdrPackage deployKeyPath modelChoices;
  };
in
{
  options.programs.pi-agent-sandbox = {
    enable = lib.mkEnableOption "pi coding agent sandbox (bubblewrap, pasta, role-based extensions)";

    herdrPackage = lib.mkOption {
      type = lib.types.nullOr lib.types.package;
      default = null;
      description = ''
        Package that provides the herdr binary inside the sandbox. If
        null, herdr integration is disabled. pi still runs in any
        terminal, but HERDR_* variables are ignored.
      '';
    };

    deployKeyPath = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      example = "/home/alice/.ssh/pi_readonly";
      description = ''
        Absolute path to an SSH deploy key, mounted read-only inside
        the sandbox. If null, no key is mounted and git-over-SSH will
        fail. git-over-HTTPS still works if the sandbox has network
        access.
      '';
    };

    modelChoices = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [
        "deepseek/deepseek-v4-flash"
        "deepseek/deepseek-v4-pro"
      ];
      description = "Models offered in the fzf picker at launch.";
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ aiAgent ];

    home.shellAliases.ai = "ai-agent";

    # Symlinks into ~/.pi/agent. Edit the files in this repository, not
    # in the home directory.
    home.file = {
      ".pi/agent/extensions/no-git-commit-push.ts".source = ../extensions/no-git-commit-push.ts;
      ".pi/agent/extensions/permission-gate.ts".source = ../extensions/permission-gate.ts;
      ".pi/agent/extensions/no-heavy-commands.ts".source = ../extensions/no-heavy-commands.ts;
      ".pi/agent/extensions/prompt-registry-adapter.ts".source = ../extensions/prompt-registry-adapter.ts;
    }
    // lib.listToAttrs (
      map
        (name: {
          name = ".pi/agent/prompts/${name}";
          value.source = ../prompts/${name};
        })
        [
          "_architect.md"
          "_ask.md"
          "_code.md"
          "_code_reviewer.md"
          "_debug.md"
          "_devops.md"
          "_documentation_writer.md"
          "_merge_resolver.md"
          "_orchestrator.md"
          "_project_research.md"
          "_security_review.md"
          "_test_engineer.md"
        ]
    );
  };
}
