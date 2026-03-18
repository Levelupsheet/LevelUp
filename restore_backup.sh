#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/var/www/backups"
DEFAULT_TARGET="/var/www/levelup"
STAMP="$(date +%Y%m%d_%H%M%S)"

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "Backup directory not found: $BACKUP_DIR"
  exit 1
fi

mapfile -d '' FILES < <(find "$BACKUP_DIR" -maxdepth 1 -mindepth 1 \( -type f -o -type d \) -printf '%P\0' | sort -z)

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "No backups found in $BACKUP_DIR"
  exit 0
fi

echo
echo "Available backups in $BACKUP_DIR"
echo "------------------------------------------------------------------"

for i in "${!FILES[@]}"; do
  f="${FILES[$i]}"
  full="$BACKUP_DIR/$f"
  size=$(du -sh "$full" 2>/dev/null | awk '{print $1}')
  mtime=$(date -r "$full" '+%Y-%m-%d %H:%M:%S')
  printf "%3d) %-55s | %-8s | %s\n" "$((i+1))" "$f" "$size" "$mtime"
done

echo
read -r -p "Select backup number to restore: " PICK

if ! [[ "$PICK" =~ ^[0-9]+$ ]] || (( PICK < 1 || PICK > ${#FILES[@]} )); then
  echo "Invalid selection."
  exit 1
fi

SELECTED="${FILES[$((PICK-1))]}"
SELECTED_PATH="$BACKUP_DIR/$SELECTED"

echo
read -r -p "Restore into target directory [$DEFAULT_TARGET]: " TARGET
TARGET="${TARGET:-$DEFAULT_TARGET}"

if [[ -z "$TARGET" ]]; then
  echo "Target directory cannot be empty."
  exit 1
fi

PARENT_DIR="$(dirname "$TARGET")"
TARGET_NAME="$(basename "$TARGET")"
SAFETY_BACKUP="${PARENT_DIR}/${TARGET_NAME}_pre_restore_${STAMP}"

mkdir -p "$PARENT_DIR"

echo
echo "Selected backup : $SELECTED_PATH"
echo "Restore target  : $TARGET"
echo "Safety backup   : $SAFETY_BACKUP"
echo

read -r -p "Type RESTORE to continue: " CONFIRM
if [[ "$CONFIRM" != "RESTORE" ]]; then
  echo "Cancelled."
  exit 0
fi

if [[ -e "$TARGET" ]]; then
  echo "Creating safety backup of current target..."
  mv "$TARGET" "$SAFETY_BACKUP"
fi

mkdir -p "$TARGET"

restore_from_archive() {
  local archive="$1"
  local dest="$2"

  case "$archive" in
    *.tar.gz|*.tgz)
      tar -xzf "$archive" -C "$dest" --strip-components=1
      ;;
    *.zip)
      unzip -q "$archive" -d "$dest"
      shopt -s dotglob nullglob
      local items=("$dest"/*)
      if [[ ${#items[@]} -eq 1 && -d "${items[0]}" ]]; then
        local inner="${items[0]}"
        mkdir -p "${dest}_tmp_flat"
        mv "$inner"/* "${dest}_tmp_flat"/ 2>/dev/null || true
        rm -rf "$dest"
        mv "${dest}_tmp_flat" "$dest"
      fi
      ;;
    *)
      echo "Unsupported archive format: $archive"
      exit 1
      ;;
  esac
}

restore_from_directory() {
  local src="$1"
  local dest="$2"
  shopt -s dotglob
  cp -a "$src"/* "$dest"/
}

echo "Restoring backup..."

if [[ -f "$SELECTED_PATH" ]]; then
  restore_from_archive "$SELECTED_PATH" "$TARGET"
elif [[ -d "$SELECTED_PATH" ]]; then
  restore_from_directory "$SELECTED_PATH" "$TARGET"
else
  echo "Selected backup is neither a file nor a directory."
  exit 1
fi

echo
echo "Restore complete."
echo "Live target: $TARGET"
if [[ -e "$SAFETY_BACKUP" ]]; then
  echo "Previous version saved at: $SAFETY_BACKUP"
fi