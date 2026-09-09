with open('student-dashboard.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

with open('scratch/view_walkthrough.txt', 'w', encoding='utf-8') as out:
    for i in range(2350, 2465):
        if i < len(lines):
            out.write(f"{i+1}: {lines[i]}")
