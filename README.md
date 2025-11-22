# Projekt

## Informacje o projekcie

Autor: kaqvu  
Repozytorium GitHub: https://github.com/kaqvu/kaqvuCore

## Jak edytować projekt?

Masz kilka sposobów, aby edytować aplikację:

### 1. Edycja lokalna w ulubionym IDE

Jeżeli chcesz pracować lokalnie:

1. Upewnij się, że masz zainstalowany Node.js i npm.  
   Możesz zainstalować Node.js za pomocą nvm: https://github.com/nvm-sh/nvm#installing-and-updating

2. Sklonuj repozytorium:

git clone https://github.com/kaqvu/kaqvuCore

3. Przejdź do katalogu projektu:

cd kaqvuCore

4. Zainstaluj wszystkie zależności:

npm install

5. Uruchom serwer developerski z automatycznym odświeżaniem i podglądem:

npm run dev

### 2. Edycja bezpośrednio w GitHub

1. Przejdź do odpowiedniego pliku w repozytorium.  
2. Kliknij przycisk „Edytuj” (ikona ołówka) w prawym górnym rogu.  
3. Wprowadź zmiany i zatwierdź je poprzez commit.

### 3. Użycie GitHub Codespaces

1. Przejdź do strony głównej repozytorium.  
2. Kliknij przycisk „Code” (zielony przycisk) w prawym górnym rogu.  
3. Wybierz zakładkę „Codespaces”.  
4. Kliknij „New codespace”, aby uruchomić środowisko.  
5. Edytuj pliki bezpośrednio w Codespace i zrób commit oraz push po zakończeniu.

## Jakie technologie są używane w tym projekcie?

Projekt jest zbudowany przy użyciu:

- Vite  
- TypeScript  
- React  
- shadcn-ui  
- Tailwind CSS  

## Jak wdrożyć projekt?

Aby uruchomić projekt produkcyjnie, wystarczy uruchomić standardowe komendy Node.js:

npm run build  
npm run preview

## Podłączenie własnej domeny

W przypadku hostingu, który wspiera podłączenie domen, wystarczy skonfigurować rekordy DNS do Twojego serwera.