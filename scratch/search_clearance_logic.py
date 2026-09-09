import re, sys

sys.stdout.reconfigure(encoding='utf-8')

def search_in_file(filepath, pattern):
    print(f"=== Matches in {filepath} ===")
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
    for i, l in enumerate(lines):
        if re.search(pattern, l, re.IGNORECASE):
            print(f"{i+1}: {l.strip()}")

search_in_file('js/app-config.js', 'studentClearance|clearance|clApprovals|department')
search_in_file('student-dashboard.html', 'clearance|mergeStudentsState')
search_in_file('clearance-dashboard.html', 'clearance|mergeStudentsState')
search_in_file('admin-dashboard.html', 'clearance|mergeStudentsState')
