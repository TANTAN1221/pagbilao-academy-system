with open('student-dashboard.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

with open('scratch/dashboard_header.txt', 'w', encoding='utf-8') as out:
    out.write("Header & Nav lines:\n")
    for i in range(min(195, len(lines))):
        out.write(f"{i+1}: {lines[i]}")
