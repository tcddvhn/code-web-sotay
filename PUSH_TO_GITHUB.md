# Push Project To GitHub

## 1. Tao repository tren GitHub

- Dang nhap [github.com](https://github.com)
- Chon `New repository`
- Dat ten repo, vi du: `code-web-consolidation`
- Khong tick them `README`, `.gitignore`, hay license vi project da co san

## 2. Day code bang HTTPS

Thay `YOUR_USERNAME` va `YOUR_REPOSITORY`:

```bash
cd /Users/tranhau/Documents/Code_sotay_V2/CODE_WEB_GITHUB_EXPORT
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

## 3. Hoac day code bang SSH

Neu may da cau hinh SSH key voi GitHub:

```bash
cd /Users/tranhau/Documents/Code_sotay_V2/CODE_WEB_GITHUB_EXPORT
git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

## 4. Neu muon cap nhat lan sau

```bash
cd /Users/tranhau/Documents/Code_sotay_V2/CODE_WEB_GITHUB_EXPORT
git add .
git commit -m "Update project"
git push
```
