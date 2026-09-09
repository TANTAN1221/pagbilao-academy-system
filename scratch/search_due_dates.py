import re, sys

sys.stdout.reconfigure(encoding='utf-8')

def find_in_file(path, words):
    print(f"=== Matches in {path} ===")
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
    for i, line in enumerate(lines):
        if any(w.lower() in line.lower() for w in words):
            print(f"{i+1}: {line.strip()}")

find_in_file('admin-dashboard.html', ['installmentTemplate', 'syncInstallmentsToSupabase', 'openInstallmentModal', 'dueStatusBody', 'renderDueDates'])
find_in_file('js/app-config.js', ['installment_templates', 'installmentTemplate', 'instTemplates'])
find_in_file('student-dashboard.html', ['installmentTemplate'])
