"""Sandboxed entrypoint for a generated build script.

Run as a *separate process* by ``execution.build_stream`` so the untrusted,
client-supplied script never shares the web server's interpreter, memory, or
(scrubbed) environment. Invoked as::

    python build_runner.py          # cwd = the per-build work_dir

It reads ``build_script.py`` from the current directory, installs the build
runtime (see ``build_runtime.install_runtime``), and ``exec``s the script.
stdout/stderr are inherited by the parent, which streams them to the client and
filters the protocol markers (``__NODE_START__``, ``__PLOT_`` …) exactly as
before. Exit code 0 = success, 1 = the script raised.
"""
import os
import sys
import gc
import traceback

import build_runtime


def main() -> int:
    work_dir = os.getcwd()
    script_path = os.path.join(work_dir, "build_script.py")
    try:
        with open(script_path, "r", encoding="utf-8") as f:
            script_code = f.read()
    except OSError as e:
        sys.stderr.write(f"FATAL: cannot read build script: {e}\n")
        return 1

    exec_globals = build_runtime.install_runtime()
    try:
        gc.collect()
        exec(compile(script_code, "build_script.py", "exec"), exec_globals)
        return 0
    except SystemExit as e:  # e.g. a deliberate stop or sys.exit in the script
        return int(e.code) if isinstance(e.code, int) else (0 if not e.code else 1)
    except BaseException as e:  # noqa: BLE001 — surface ANY failure to the user
        # Preserve the historical error report: numbered script + traceback, both
        # streamed to the client (it's the user's own generated script) and saved
        # to error.log for the result bundle.
        script_lines = [f"{i + 1:03d}: {line}" for i, line in enumerate(script_code.splitlines())]
        err_msg = "\nGENERATED SCRIPT:\n" + "\n".join(script_lines) + "\n"
        err_msg += f"\nFATAL BUILD ERROR: {e}\n{traceback.format_exc()}\n"
        sys.stdout.write(err_msg)
        sys.stdout.flush()
        try:
            with open(os.path.join(work_dir, "error.log"), "w", encoding="utf-8") as err_f:
                err_f.write(err_msg)
        except OSError:
            pass
        return 1


if __name__ == "__main__":
    sys.exit(main())
