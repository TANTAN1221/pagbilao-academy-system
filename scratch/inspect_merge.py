import re

def print_function(filepath, func_name):
    print(f"=== {func_name} in {filepath} ===")
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
    in_func = False
    brace_count = 0
    for i, line in enumerate(lines):
        if f"function {func_name}" in line or f"const {func_name}" in line or f"{func_name}(" in line and "mergeStudentsState" in line:
            in_func = True
        if in_func:
            print(f"{i+1}: {line.rstrip()}")
            brace_count += line.count('{') - line.count('}')
            if brace_count <= 0 and i > 5 and ('}' in line or ';' in line):
                break

print_function('js/app-config.js', 'mergeStudentsState')
print_function('student-dashboard.html', 'mergeStudentsState')
print_function('clearance-dashboard.html', 'mergeStudentsState')
print_function('admin-dashboard.html', 'mergeStudentsState')
