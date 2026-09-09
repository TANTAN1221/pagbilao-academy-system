with open('admin-dashboard.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'dueStatus' in line:
        print(f"{i+1}: {line.strip()}")
