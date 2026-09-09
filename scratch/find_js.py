with open('student-dashboard.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

with open('scratch/js_functions.txt', 'w', encoding='utf-8') as out:
    in_script = False
    for i, line in enumerate(lines):
        if '<script' in line:
            in_script = True
        if in_script:
            if 'function ' in line or 'const ' in line and '=' in line and '=>' in line:
                out.write(f"{i+1}: {line.strip()}\n")
        if '</script>' in line:
            in_script = False
