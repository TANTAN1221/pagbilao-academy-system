import os, re, sys

sys.stdout.reconfigure(encoding='utf-8')

sys_files = []
for root, dirs, files in os.walk('.'):
    if '.git' in root or 'node_modules' in root or 'scratch' in root:
        continue
    for f in files:
        if f.endswith(('.html', '.js')):
            sys_files.append(os.path.join(root, f))

for path in sys_files:
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
        if 'merge' in content.lower():
            lines = content.split('\n')
            for i, line in enumerate(lines):
                if 'function merge' in line.lower() or 'clearance:' in line.lower():
                    print(f"{path}:{i+1}: {line.strip()}")
