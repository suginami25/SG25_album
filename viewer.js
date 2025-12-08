// ファイル名           : viewer.js
// バージョン           : v0.9.7  （第2画面サムネイルを photo_data_web_resized から読み込む対応）
// 作成日               : 2025-12-01
// 更新日               : 2025-12-07  (第2・第3画面の画像を background-image 化して長押し保存を抑止)
// 保存先               : /Users/yoichiamano/Projects/Album_Viewer/WISE/generator/WEB公開用正本/viewer.js
// 実行方法（この1行をターミナルにコピペすればOK）:
//                        cd "/Users/yoichiamano/Projects/Album_Viewer/WISE/generator/WEB公開用正本" && open index.html
// 前提フォルダ構成     : - WISE/generator/WEB公開用正本/
//                        ├─ index.html
//                        ├─ style.css
//                        ├─ viewer.js   ← 本ファイル
//                        ├─ photos_index.js
//                        └─ assets/logo_suginami.jpg
//                       （写真ファイル群は PDIS/RINA/PAAS により生成された photo_data_web 配下に配置される）
// 役割                 : SG25 Photo Archive Platform（SG25-PAP）用 三画面アルバムビューア（WISE版）の挙動を制御。
//                        - 第1画面：カテゴリ一覧
//                        - 第2画面：サムネイル一覧（カテゴリ配下をグループ／サブID単位で表示）
//                        - 第3画面：1枚拡大表示（黒枠＋キャプション表示）
//                        - 第2画面は 100枚／ページでページ分割し、ページ数が2以上のときのみ 🐶＋🏠＋🐶 ナビを表示。
// 注意事項             : - photos_index.js に定義された構造（カテゴリ／グループ／写真配列）を前提とする。
//                        - 本ファイルは WISE/generator/WEB公開用正本/ における「WEB公開用正本」として手動管理する。
//                        - 公開時は PUBL または SG25_album 側にディレクトリごとコピーして利用すること。
//                        - 仕様変更時はバージョンと更新日、上記役割・注意事項の内容も必ず見直すこと。

// ============================================================
// ファイル名      : viewer.js
// 役割           : 同期会アルバムビューア（PAAS）の画面遷移と表示制御。
//                   - 第1画面：カテゴリ一覧
//                   - 第2画面：サムネイル一覧（カテゴリ配下をグループごと）
//                   - 第3画面：拡大表示
//                 window.PHOTOS_INDEX（photos_index.js）が前提。
//                 構造:
//                   PHOTOS_INDEX = {
//                     categories: {
//                       "<catKey>": {
//                         title: "<カテゴリ名>",
//                         groups: [
//                           {
//                             name: "<グループ名>",
//                             photos: [
//                               { filename: "<ファイル名>", src: "<画像パス>" },
//                               ...
//                             ]
//                           },
//                           ...
//                         ]
//                       },
//                       ...
//                     }
//                   }
//
// バージョン     : v0.9.6 (Paging+Nav + 長押し抑止用 background-image 化)
// 作成日         : 2025-11-22
// 更新日         : 2025-12-07
//   - 第3画面 context 表示を
//       「カテゴリ / グループ名 / サブフォルダID(任意)」に統一
//   - サブフォルダID が "X" の場合は context に表示しない
//   - 第3画面右下の「戻る（🔙）」ボタン（class="back-button"）を有効化
// 保存先         : /Users/yoichiamano/Projects/Album_Viewer/PAAS/
//
// 実行方法       :
//   - index.html と同じフォルダに保存し、
//     ブラウザで index.html を開けば自動的に読み込まれる。
//   - 直接このファイルを実行する必要はない。
//
// 前提ファイル:
//   - index.html
//   - style.css
//   - photos_index.js （Photo_index_Generater で自動生成）
//
// 注意事項:
//   - 画面構成は 3 画面方式固定。
//   - 第3画面の表示内容（カテゴリ名 / グループ名 / ファイル名 / サブフォルダ）は
//       formatGroupLabelForContext により
//       「1.9.集合写真 → 集合写真」
//       「1.5.全体歓談 → 全体歓談」
//     の形式に変換される。
//   - サブフォルダID（subId）が "X" の場合は context には出さない。
//   - 🔙 ボタンは class="back-button" で取得し、第2画面へ戻る。
// ============================================================

(function () {
  "use strict";

  // ----------------------------------------------------------
  // DOM 要素参照
  // ----------------------------------------------------------

  let screenCategory;
  let screenGallery;
  let screenViewer;

  let categoryList;
  let galleryTitle;
  let galleryContainer;

  let viewerImage;
  let viewerImageCover; // 第3画面用：画像保存抑止用のオーバーレイ
  let viewerFilename;
  let viewerContext;
  let viewerCloseButton;

  let homeButton;
  let backButton; // 🔙 用

  // 現在の表示状態（第3画面用）
  let currentCategoryKey = null;
  let currentGroupIndex = null;
  let currentPhotoIndex = null;

  let currentGalleryFlatItems = [];
  let currentGalleryPage = 1;
  let currentGalleryTotalPages = 1;

  let galleryPageNav = null;
  let galleryPrevButton = null;
  let galleryHomeButton = null;
  let galleryNextButton = null;

  // ----------------------------------------------------------
  // 内部UI命名の正規表現
  //   <catID>.<grpID>.<subID>_<seq>.<ext>
  //   例: 1.6.1-1_001.jpg, 1.7.バスケット_003.JPG
  // ----------------------------------------------------------
  const INTERNAL_NAME_RE =
    /^([^.]+)\.([^.]+)\.([^_]+)_(\d{3})\.([A-Za-z0-9]+)$/;

  function extractSubIdFromFilename(filename) {
    const m = INTERNAL_NAME_RE.exec(filename || "");
    if (!m) return null;
    return m[3]; // subID 部分
  }

  function extractGrpIdFromGroupName(groupName) {
    const name = groupName || "";
    const parts = name.split(".");
    if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
      return parseInt(parts[1], 10);
    }
    return Number.MAX_SAFE_INTEGER;
  }

  function buildGroupOrder(groups) {
    const indices = groups.map((_, idx) => idx);
    indices.sort((a, b) => {
      const ga = groups[a];
      const gb = groups[b];
      const ida = extractGrpIdFromGroupName(ga && ga.name);
      const idb = extractGrpIdFromGroupName(gb && gb.name);
      return ida - idb;
    });
    return indices;
  }

  // ----------------------------------------------------------
  // subID ごとに写真分割
  // ----------------------------------------------------------

  function splitPhotosBySubId(photos) {
    const map = new Map();
    photos.forEach((photo, index) => {
      const subId = extractSubIdFromFilename(photo.filename || "");
      if (!subId) return;
      if (!map.has(subId)) {
        map.set(subId, { subId: subId, items: [] });
      }
      map.get(subId).items.push({ photo, index });
    });

    const blocks = Array.from(map.values());
    if (blocks.length <= 1) return null;
    return blocks;
  }

  // ----------------------------------------------------------
  // 第3画面用：viewerImage の上に background-image ベースの
  // オーバーレイ（viewerImageCover）を載せる
  // ----------------------------------------------------------
  function setupViewerImageCover() {
    if (!viewerImage) return;
    const parent = viewerImage.parentElement;
    if (!parent) return;

    // ラッパーを相対配置に
    const currentPosition = window.getComputedStyle(parent).position;
    if (!currentPosition || currentPosition === "static") {
      parent.style.position = "relative";
    }

    // 既に作っていれば再利用
    if (!viewerImageCover) {
      viewerImageCover = document.createElement("div");
      viewerImageCover.id = "viewer-image-cover";
      viewerImageCover.className = "viewer-image-cover";
      parent.appendChild(viewerImageCover);
    }

    // img 自体は視覚的には非表示＋イベントを受けない状態に
    viewerImage.style.opacity = "0";
    viewerImage.style.pointerEvents = "none";
  }

  // ----------------------------------------------------------
  // 画面切替
  // ----------------------------------------------------------

  function showScreen(name) {
    if (screenCategory) {
      screenCategory.style.display = "none";
      screenCategory.classList.remove("screen-active");
    }
    if (screenGallery) {
      screenGallery.style.display = "none";
      screenGallery.classList.remove("screen-active");
    }
    if (screenViewer) {
      screenViewer.style.display = "none";
      screenViewer.classList.remove("screen-active");
    }

    if (name === "category") {
      screenCategory.style.display = "block";
      screenCategory.classList.add("screen-active");
    } else if (name === "gallery") {
      screenGallery.style.display = "block";
      screenGallery.classList.add("screen-active");
    } else if (name === "viewer") {
      screenViewer.style.display = "block";
      screenViewer.classList.add("screen-active");
    }

    if (homeButton) {
      homeButton.style.display = name === "category" ? "none" : "block";
    }
    if (backButton) {
      backButton.style.display = name === "viewer" ? "block" : "none";
    }

    updateGalleryNavVisibility();
  }

  // ----------------------------------------------------------
  // カテゴリ名整形（番号除去）
  //   例: "1.1次会・2次会" → "1次会・2次会"
  // ----------------------------------------------------------

  function formatCategoryTitle(rawTitle, catKey) {
    const base = rawTitle || catKey || "";
    const dotIndex = base.indexOf(".");
    if (dotIndex >= 0) return base.slice(dotIndex + 1);
    return base;
  }

  // ----------------------------------------------------------
  // 第2画面：グループタイトル（【全体歓談】など）
  //   例: "1.9.集合写真" → "【集合写真】"
  // ----------------------------------------------------------

  function formatGroupTitle(groupName) {
    const name = groupName || "";
    const parts = name.split(".");
    if (parts.length >= 3) {
      return `【${parts.slice(2).join(".")}】`;
    }
    return `【${name}】`;
  }

  // ----------------------------------------------------------
  // 第3画面用：グループ名（番号除去して素の名前だけ）
  //   例: "1.9.集合写真" → "集合写真"
  // ----------------------------------------------------------

  function formatGroupLabelForContext(groupName) {
    const name = groupName || "";
    const parts = name.split(".");
    if (parts.length >= 3) {
      return parts.slice(2).join(".");
    }
    return name;
  }

  // ----------------------------------------------------------
  // ファイル名整形
  //   例: "1.2.X_009.jpg" → "009.jpg"
  // ----------------------------------------------------------

  function formatDisplayFilename(filename) {
    const base = filename || "";
    const pos = base.indexOf("_");
    if (pos >= 0) return base.slice(pos + 1);
    return base;
  }

  // ----------------------------------------------------------
  // 第1画面：カテゴリ一覧
  // ----------------------------------------------------------

  function renderCategoryList() {
    const categories = window.PHOTOS_INDEX.categories;
    const catKeys = Object.keys(categories).sort();
    categoryList.innerHTML = "";

    catKeys.forEach((catKey) => {
      const cat = categories[catKey];
      const displayTitle = formatCategoryTitle(cat.title, catKey);

      let total = 0;
      cat.groups.forEach((g) => (total += g.photos.length));

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "category-card";
      btn.innerHTML =
        total > 0
          ? `<span class="category-label">${displayTitle}</span><span class="category-count">（${total}枚）</span>`
          : `<span class="category-label">${displayTitle}</span>`;

      btn.addEventListener("click", () => {
        currentCategoryKey = catKey;
        openGalleryForCategory(catKey);
      });

      categoryList.appendChild(btn);
    });
  }

  // ----------------------------------------------------------
  // 第2画面：ギャラリー（ページ分割＋犬＋🏠＋犬ナビ）
  // ----------------------------------------------------------

  // 1ページあたりのサムネイル枚数
  const PHOTOS_PER_PAGE = 100;

  // 現在のカテゴリに対する「フラット化された写真一覧」を構築
  function buildFlatGalleryItems(catKey) {
    const cat = window.PHOTOS_INDEX.categories[catKey];
    if (!cat || !cat.groups) return [];

    const groups = cat.groups;
    const order = buildGroupOrder(groups);
    const flat = [];

    order.forEach((groupIndex) => {
      const group = groups[groupIndex];
      if (!group || !group.photos) return;
      group.photos.forEach((photo, photoIndex) => {
        flat.push({
          groupIndex,
          photoIndex,
          photo,
        });
      });
    });

    return flat;
  }

  // ギャラリーページナビの表示・非表示を制御
  function updateGalleryNavVisibility() {
    if (!galleryPageNav) return;

    const isGalleryActive =
      screenGallery && screenGallery.classList.contains("screen-active");
    const hasMultiplePages =
      isGalleryActive &&
      currentGalleryTotalPages &&
      currentGalleryTotalPages > 1;

    // 第2画面でページ数が2ページ以上ある場合のみ、中央の 🐶＋🏠＋🐶 ナビを表示
    galleryPageNav.style.display = hasMultiplePages ? "flex" : "none";

    // 第2画面でページ数が2ページ以上ある場合は、左下の 🏠 ボタンは隠す。
    // 1ページのみの場合は、従来どおり左下 🏠 を表示する。
    if (homeButton && isGalleryActive) {
      if (hasMultiplePages) {
        homeButton.style.display = "none";
      } else {
        homeButton.style.display = "block";
      }
    }
  }

  // 現在のページ番号 currentGalleryPage に基づいて第2画面を描画
  function renderGalleryPage() {
    if (!currentCategoryKey) return;

    const cat = window.PHOTOS_INDEX.categories[currentCategoryKey];
    if (!cat || !cat.groups) return;

    const groups = cat.groups;
    galleryContainer.innerHTML = "";

    if (!currentGalleryFlatItems || currentGalleryFlatItems.length === 0) {
      updateGalleryNavVisibility();
      return;
    }

    const total = currentGalleryFlatItems.length;
    const totalPages = currentGalleryTotalPages || 1;
    if (currentGalleryPage < 1) currentGalleryPage = 1;
    if (currentGalleryPage > totalPages) currentGalleryPage = totalPages;

    const startIndex = (currentGalleryPage - 1) * PHOTOS_PER_PAGE;
    const endIndex = Math.min(startIndex + PHOTOS_PER_PAGE, total);
    const pageItems = currentGalleryFlatItems.slice(startIndex, endIndex);

    const groupOrderOnPage = [];
    const groupMap = new Map();

    pageItems.forEach((item) => {
      const gIndex = item.groupIndex;
      if (!groupMap.has(gIndex)) {
        groupMap.set(gIndex, []);
        groupOrderOnPage.push(gIndex);
      }
      groupMap.get(gIndex).push(item);
    });

    groupOrderOnPage.forEach((groupIndex) => {
      const group = groups[groupIndex];
      if (!group) return;

      const items = groupMap.get(groupIndex) || [];

      const h3 = document.createElement("h3");
      h3.className = "gallery-group-title";
      h3.textContent = formatGroupTitle(group.name);
      galleryContainer.appendChild(h3);

      const subMap = new Map();
      items.forEach((item) => {
        const filename = (item.photo && item.photo.filename) || "";
        const subId = extractSubIdFromFilename(filename) || "";
        const key = subId || "";
        if (!subMap.has(key)) {
          subMap.set(key, []);
        }
        subMap.get(key).push(item);
      });

      const blocks = [];
      subMap.forEach((blockItems, subId) => {
        if (subId) {
          blocks.push({ subId, items: blockItems });
        }
      });

      if (blocks.length <= 1) {
        const grid = document.createElement("div");
        grid.className = "gallery-grid";

        items.forEach((item) => {
          const photo = item.photo;
          const t = document.createElement("div");
          t.className = "thumb";

          const thumbImage = document.createElement("div");
          thumbImage.className = "thumb-image";
          const thumbSrc = photo.src.replace(
            "photo_data_web/",
            "photo_data_web_resized/"
          );
          // ★スペース・日本語を含むパスを安全に解釈させるため URL をクオート
          thumbImage.style.backgroundImage = `url("${thumbSrc}")`;

          const file = document.createElement("div");
          file.className = "thumb-filename";
          file.textContent = formatDisplayFilename(photo.filename);

          t.appendChild(thumbImage);
          t.appendChild(file);

          t.addEventListener("click", () => {
            openViewer(currentCategoryKey, item.groupIndex, item.photoIndex);
          });

          grid.appendChild(t);
        });

        galleryContainer.appendChild(grid);
      } else {
        blocks.forEach((block) => {
          const h4 = document.createElement("h4");
          h4.className = "gallery-subgroup-title";
          h4.textContent = `■ ${block.subId}`;
          galleryContainer.appendChild(h4);

          const grid = document.createElement("div");
          grid.className = "gallery-grid";

          block.items.forEach((item) => {
            const photo = item.photo;
            const t = document.createElement("div");
            t.className = "thumb";

            const img = document.createElement("img");
            const thumbSrc2 = photo.src.replace(
              "photo_data_web/",
              "photo_data_web_resized/"
            );
            img.src = thumbSrc2;

            const file = document.createElement("div");
            file.className = "thumb-filename";
            file.textContent = formatDisplayFilename(photo.filename);

            t.appendChild(img);
            t.appendChild(file);

            t.addEventListener("click", () => {
              openViewer(currentCategoryKey, item.groupIndex, item.photoIndex);
            });

            grid.appendChild(t);
          });

          galleryContainer.appendChild(grid);
        });
      }
    });

    updateGalleryNavVisibility();
  }

  // 前／次ページに移動（ページ境界ではループ）
  function changeGalleryPage(delta) {
    if (!currentGalleryFlatItems || currentGalleryFlatItems.length === 0)
      return;
    if (!currentGalleryTotalPages || currentGalleryTotalPages <= 1) return;

    currentGalleryPage += delta;

    if (currentGalleryPage < 1) {
      currentGalleryPage = currentGalleryTotalPages;
    } else if (currentGalleryPage > currentGalleryTotalPages) {
      currentGalleryPage = 1;
    }

    renderGalleryPage();
  }

  // 指定カテゴリの第2画面を開く（page=1 から表示開始）
  function openGalleryForCategory(catKey) {
    const cat = window.PHOTOS_INDEX.categories[catKey];
    if (!cat) return;

    currentCategoryKey = catKey;

    const displayTitle = formatCategoryTitle(cat.title, catKey);
    galleryTitle.textContent = displayTitle;

    currentGalleryFlatItems = buildFlatGalleryItems(catKey);
    const total = currentGalleryFlatItems.length;
    currentGalleryTotalPages = total > 0 ? Math.ceil(total / PHOTOS_PER_PAGE) : 1;
    currentGalleryPage = 1;

    renderGalleryPage();
    showScreen("gallery");
  }

  // ----------------------------------------------------------
  // 第3画面：拡大表示（修正版）
  // ----------------------------------------------------------

  function openViewer(catKey, groupIndex, photoIndex) {
    const categories = window.PHOTOS_INDEX.categories;
    const cat = categories[catKey];
    const group = cat.groups[groupIndex];
    const photo = group.photos[photoIndex];

    currentCategoryKey = catKey;
    currentGroupIndex = groupIndex;
    currentPhotoIndex = photoIndex;

    // 表示画像
    if (viewerImageCover) {
      // ★こちらも URL をクオートして background-image に指定
      viewerImageCover.style.backgroundImage = `url("${photo.src}")`;
    }
    if (viewerImage) {
      viewerImage.src = photo.src;
      viewerImage.alt = photo.filename || "";
    }

    // カテゴリ名（番号除去）
    const displayTitle = formatCategoryTitle(cat.title, catKey);

    // グループ名（番号除去：例 1.9.集合写真 → 集合写真）
    const groupLabel = formatGroupLabelForContext(group.name);

    // subID（内部UI命名から抽出。X の場合は表示しない）
    const subId = extractSubIdFromFilename(photo.filename);

    // context を部品ごとに構成する
    const contextParts = [];
    if (displayTitle) contextParts.push(displayTitle);
    if (groupLabel) contextParts.push(groupLabel);
    if (subId && subId !== "X") contextParts.push(subId);

    // 表示ファイル名（001.jpg など）
    viewerFilename.textContent = formatDisplayFilename(photo.filename);

    // 「カテゴリ / グループ名 / サブフォルダID(あれば)」
    viewerContext.textContent = contextParts.join(" / ");

    showScreen("viewer");
  }

  // ----------------------------------------------------------
  // イベント設定
  // ----------------------------------------------------------

  function setupEventHandlers() {
    // 🏠 → 第1画面へ
    if (homeButton) {
      homeButton.addEventListener("click", () => {
        showScreen("category");
      });
    }

    // 🔙 → 第2画面へ（直前に開いていたカテゴリを再描画）
    if (backButton) {
      backButton.addEventListener("click", () => {
        if (currentCategoryKey) {
          openGalleryForCategory(currentCategoryKey);
        } else {
          showScreen("gallery");
        }
      });
    }

    // 第2画面用 犬＋🏠＋犬 ナビ
    if (galleryPrevButton) {
      galleryPrevButton.addEventListener("click", () => {
        changeGalleryPage(-1);
      });
    }

    if (galleryNextButton) {
      galleryNextButton.addEventListener("click", () => {
        changeGalleryPage(1);
      });
    }

    if (galleryHomeButton) {
      galleryHomeButton.addEventListener("click", () => {
        showScreen("category");
      });
    }
  }

  // ----------------------------------------------------------
  // 初期化
  // ----------------------------------------------------------

  function init() {
    screenCategory = document.getElementById("screen-category");
    screenGallery = document.getElementById("screen-gallery");
    screenViewer = document.getElementById("screen-viewer");

    categoryList = document.getElementById("category-list");
    galleryTitle = document.getElementById("gallery-title");
    galleryContainer = document.getElementById("gallery-container");

    viewerImage = document.getElementById("viewer-image");
    viewerFilename = document.getElementById("viewer-filename");

    // 第3画面用オーバーレイをセットアップ（background-image で表示）
    setupViewerImageCover();
    viewerContext = document.getElementById("viewer-context");
    viewerCloseButton = document.getElementById("viewer-close-button");

    homeButton = document.getElementById("home-button");
    backButton = document.querySelector(".back-button"); // 🔙

    // 第2画面用 犬＋🏠＋犬 ナビを生成
    if (screenGallery) {
      galleryPageNav = document.createElement("div");
      galleryPageNav.id = "gallery-page-nav";
      galleryPageNav.className = "gallery-page-nav";
      galleryPageNav.style.display = "none";
      galleryPageNav.style.position = "fixed";
      galleryPageNav.style.left = "50%";
      galleryPageNav.style.bottom = "16px";
      galleryPageNav.style.transform = "translateX(-50%)";
      galleryPageNav.style.zIndex = "10";
      galleryPageNav.style.display = "none";
      galleryPageNav.style.gap = "12px";
      galleryPageNav.style.alignItems = "center";
      galleryPageNav.style.justifyContent = "center";

      galleryPrevButton = document.createElement("button");
      galleryPrevButton.type = "button";
      galleryPrevButton.className = "gallery-nav-button gallery-nav-prev";
      galleryPrevButton.textContent = "🐶";

      galleryHomeButton = document.createElement("button");
      galleryHomeButton.type = "button";
      galleryHomeButton.className = "gallery-nav-button gallery-nav-home";
      galleryHomeButton.textContent = "🏠";

      galleryNextButton = document.createElement("button");
      galleryNextButton.type = "button";
      galleryNextButton.className = "gallery-nav-button gallery-nav-next";
      galleryNextButton.textContent = "🐶";

      galleryPageNav.appendChild(galleryPrevButton);
      galleryPageNav.appendChild(galleryHomeButton);
      galleryPageNav.appendChild(galleryNextButton);

      screenGallery.appendChild(galleryPageNav);
    }

    setupEventHandlers();
    renderCategoryList();
    showScreen("category");
  }

  document.addEventListener("DOMContentLoaded", function () {
    // 既存の初期化処理
    init();

    // 全画面共通：右クリック（コンテキストメニュー）を抑止（キャプチャフェーズ）
    document.addEventListener(
      "contextmenu",
      function (event) {
        event.preventDefault();
      },
      true
    );

    // 画像などのドラッグ開始も抑止（ドラッグ＆ドロップ保存の抑止）
    document.addEventListener("dragstart", function (event) {
      event.preventDefault();
    });
  });
})();