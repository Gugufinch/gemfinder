import csv
import os

FILES_TO_CLEAN = ['locations_run_1.csv', 'locations_run_2.csv', 'scout_memory.csv']
VENUES_TO_REMOVE = [
    "empty bottle",
    "thalia hall",
    "riviera theatre",
    "aragon ballroom",
    "city winery",
    "green mill",
    "ramova theatre",
    "salt shed",
    "music box theatre",
    "logan theatre",
    "genesiskel",
    "gene siskel",
    "patio theater",
    "portage theater"
]

def clean_file(filename):
    if not os.path.exists(filename):
        return 0
    
    with open(filename, 'r', encoding='utf-8') as f:
        reader = list(csv.DictReader(f))
        fieldnames = reader[0].keys() if reader else []
        
    cleaned = []
    removed_count = 0
    for row in reader:
        name = row.get('Location Name', '').lower()
        if not any(venue in name for venue in VENUES_TO_REMOVE):
            cleaned.append(row)
        else:
            print(f"Removed from {filename}: {row.get('Location Name')}")
            removed_count += 1
            
    if removed_count > 0:
        with open(filename, 'w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(cleaned)
            
    return removed_count

def main():
    total = 0
    for f in FILES_TO_CLEAN:
        try:
            removed = clean_file(f)
            total += removed
            print(f"Cleaned {f}: removed {removed} locations.")
        except Exception as e:
            print(f"Error cleaning {f}: {e}")
            
    print(f"\nTotal removed across all operations: {total}")

if __name__ == '__main__':
    main()
