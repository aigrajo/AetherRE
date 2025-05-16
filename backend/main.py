#!/usr/bin/env python3
import sys
import json
import os
import subprocess
import re
from pathlib import Path

def analyze_binary(binary_path):
    try:
        print(f"[DEBUG] analyze_binary called with: {binary_path}", file=sys.stderr, flush=True)
        binary_dir = os.path.dirname(binary_path)
        binary_name = os.path.basename(binary_path)
        output_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
        os.makedirs(output_dir, exist_ok=True)
        output_json = os.path.join(output_dir, f"{binary_name}_functions.json")
        headless_script = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'scripts', 'run_ghidra_headless.bat')
        print(f"[DEBUG] headless_script: {headless_script}", file=sys.stderr, flush=True)
        print(f"[DEBUG] output_json: {output_json}", file=sys.stderr, flush=True)
        print(f"[DEBUG] output_dir: {output_dir}", file=sys.stderr, flush=True)
        print(f"[DEBUG] Running: {headless_script} {binary_path}", file=sys.stderr, flush=True)

        print(json.dumps({"type": "progress", "progress": 10}))

        env = os.environ.copy()
        env['GHIDRA_OUTPUT_DIR'] = output_dir

        project_root = os.path.dirname(os.path.dirname(__file__))
        process = subprocess.Popen(
            [headless_script, "-binary", binary_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
            cwd=project_root,
            bufsize=1  # line-buffered
        )

        progress_re = re.compile(r'\[PROGRESS\] (\d+)/(\d+)')
        # Read progress from stdout
        while True:
            line = process.stdout.readline()
            if not line:
                break
            print(f"[BACKEND DEBUG] {line.strip()}", file=sys.stderr, flush=True)
            match = progress_re.search(line)
            if match:
                processed = int(match.group(1))
                total = int(match.group(2))
                percent = int((processed / total) * 100)
                print(json.dumps({"type": "progress", "progress": percent}))
                sys.stdout.flush()

        # Read progress from stderr
        while True:
            line = process.stderr.readline()
            if not line:
                break
            print(f"[BACKEND DEBUG] {line.strip()}", file=sys.stderr, flush=True)
            match = progress_re.search(line)
            if match:
                processed = int(match.group(1))
                total = int(match.group(2))
                percent = int((processed / total) * 100)
                print(json.dumps({"type": "progress", "progress": percent}))
                sys.stdout.flush()

        process.wait()
        print(f"[DEBUG] Return code: {process.returncode}", file=sys.stderr, flush=True)
        # Read the rest of stdout and stderr for debugging
        if process.stdout:
            for line in process.stdout:
                print(f"[DEBUG] STDOUT: {line.strip()}", file=sys.stderr, flush=True)
        if process.stderr:
            for line in process.stderr:
                print(f"[DEBUG] STDERR: {line.strip()}", file=sys.stderr, flush=True)

        print(json.dumps({"type": "progress", "progress": 90}))

        if process.returncode != 0:
            print(json.dumps({
                "type": "error",
                "message": f"Analysis failed: see logs for details"
            }))
            return

        if not os.path.exists(output_json):
            print(json.dumps({
                "type": "error",
                "message": f"JSON output not found: {output_json}"
            }))
            return

        print(f"[DEBUG] JSON file found: {output_json}", file=sys.stderr, flush=True)

        with open(output_json, 'r') as f:
            data = json.load(f)

        print(json.dumps({
            "type": "analysis_complete",
            "data": data,
            "path": output_json,
            "filename": os.path.basename(output_json)
        }))

    except Exception as e:
        print(json.dumps({
            "type": "error",
            "message": str(e)
        }))

def main():
    # Read messages from stdin
    while True:
        try:
            message = input()
            data = json.loads(message)
            
            if data.get('type') == 'analyze_binary':
                analyze_binary(data['path'])
                
        except EOFError:
            break
        except Exception as e:
            print(json.dumps({
                "type": "error",
                "message": str(e)
            }))

if __name__ == '__main__':
    main() 