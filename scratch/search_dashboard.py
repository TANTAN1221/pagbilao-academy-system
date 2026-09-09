with open('student-dashboard.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

with open('scratch/dashboard_page_output.txt', 'w', encoding='utf-8') as out:
    out.write("Dashboard Page lines:\n")
    for i, line in enumerate(lines):
        if 'id="dashboardPage"' in line:
            out.write(f"dashboardPage starts at line {i+1}\n")
            for j in range(i, i + 350):
                if j < len(lines):
                    out.write(f"{j+1}: {lines[j]}")
            break
