#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/var/www/backups"

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "Backup directory not found: $BACKUP_DIR"
  exit 1
fi

mapfile -d '' FILES < <(find "$BACKUP_DIR" -maxdepth 1 -mindepth 1 -printf '%P\0' | sort -z)

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "No backups found in $BACKUP_DIR"
  exit 0
fi

echo
echo "Backups in $BACKUP_DIR"
echo "------------------------------------------------------------"

for i in "${!FILES[@]}"; do
  f="${FILES[$i]}"
  full="$BACKUP_DIR/$f"
  size=$(du -sh "$full" 2>/dev/null | awk '{print $1}')
  mtime=$(date -r "$full" '+%Y-%m-%d %H:%M:%S')
  printf "%3d) %-50s | %-8s | %s\n" "$((i+1))" "$f" "$size" "$mtime"
done

echo
echo "Enter the numbers of the backups you want to KEEP."
echo "Example: 1 3 5"
read -r -p "Keep selection: " -a KEEP_IDX

declare -A KEEP_MAP=()
for n in "${KEEP_IDX[@]}"; do
  if [[ "$n" =~ ^[0-9]+$ ]] && (( n >= 1 && n <= ${#FILES[@]} )); then
    KEEP_MAP["$n"]=1
  fi
done

TO_DELETE=()
TO_KEEP=()

for i in "${!FILES[@]}"; do
  idx=$((i+1))
  if [[ -n "${KEEP_MAP[$idx]:-}" ]]; then
    TO_KEEP+=("${FILES[$i]}")
  else
    TO_DELETE+=("${FILES[$i]}")
  fi
done

echo
echo "Will KEEP:"
echo "------------------------------------------------------------"
if [[ ${#TO_KEEP[@]} -eq 0 ]]; then
  echo "(none)"
else
  printf '  %s\n' "${TO_KEEP[@]}"
fi

echo
echo "Will DELETE:"
echo "------------------------------------------------------------"
if [[ ${#TO_DELETE[@]} -eq 0 ]]; then
  echo "(none)"
  exit 0
else
  printf '  %s\n' "${TO_DELETE[@]}"
fi

echo
read -r -p "Type DELETE to permanently remove the unselected backups: " CONFIRM

if [[ "$CONFIRM" != "DELETE" ]]; then
  echo "Cancelled. No files were deleted."
  exit 0
fi

for f in "${TO_DELETE[@]}"; do
  rm -rf -- "$BACKUP_DIR/$f"
  echo "Deleted: $f"
done

echo
echo "Done."