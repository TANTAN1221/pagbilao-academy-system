with open('js/app-config.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

with open('scratch/inspect_fetch_state.txt', 'w', encoding='utf-8') as out:
    out.write("fetchState in app-config.js:\n")
    for i in range(730, 810):
        if i < len(lines):
            out.write(f"{i+1}: {lines[i]}")
