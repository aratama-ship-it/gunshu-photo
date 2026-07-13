// ===== 調整パラメータ =====
// 現場感覚に合わせた微調整はすべてここを直す（他のコードに数値を直書きしない）
const CONFIG = {
  // センサーごとの光学定数。cocMm = 許容錯乱円（小さいほど厳しい判定 → F値が絞り気味になる）
  // 0.030(FF)/0.020(APS-C)の古典基準を採用。一般的なDOF計算機と「最低F値」が一致する。
  // 高画素機の等倍鑑賞に対する備えは、CoCを厳しくするのではなく安全マージン(段数)側で持つ
  sensors: {
    "full-frame": { widthMm: 36, cropFactor: 1, cocMm: 0.03 },
    apsc: { widthMm: 23.5, cropFactor: 1.5, cocMm: 0.02 },
  },
  lineup: {
    rowGapM: 0.75, // 列と列の前後間隔（表示・描画・被写界深度計算で共通）
    bodyDepthM: 0.5, // 前後の身体の厚み＋立ち位置のばらつき余裕
    usableWidthRatio: 0.9, // 画角の横幅のうち、人を並べてよい割合
    minUsableWidthM: 1.8,
    maxRows: 12,
    // 1人あたりの横ピッチ。隣と肩を寄せて触れ合う密着状態が前提（肩幅≒0.42m）
    shoulderPitchM: 0.42,
    // 人数→列数の下限。少人数で1列に横長に並べると画角の横幅が無駄になるため、
    // 幅に収まる場合でも最低この列数で固める（rows: 0 は幅からの計算に任せる）
    minRowsTiers: [
      { maxCount: 4, rows: 1 },
      { maxCount: 12, rows: 2 },
      { maxCount: 24, rows: 3 },
      { maxCount: 48, rows: 4 },
      { maxCount: Infinity, rows: 0 },
    ],
  },
  aperture: {
    safetyStops: 1, // 最低F値に足す安全マージン（段数）。整列誤差・ピント誤差・高画素機対策
    minN: 5.6, // 推奨値はこれ以上開けない（周辺画質・歩留まり優先）。最低F値の表示には適用しない
    maxN: 22, // これを超える必要が出たら "F22+" 表示（＝条件の見直し推奨）
    stops: [1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22], // 表示に使う標準絞り段
  },
  // 横ピッチ(m/人)による密集度判定のしきい値
  density: { roomyM: 0.54, standardM: 0.44, tightM: 0.36 },
  // プレビュー描画の見た目調整（物理計算には影響しない）
  visual: {
    // 人物は身長165cm・7頭身のシルエット。グリフは高さ70ユニット（=1頭10ユニット）で定義し、
    // 描画サイズは「その列の実距離でのpx/m × 1.65m」の実寸ベース（見た目係数は使わない）
    personHeightM: 1.65,
    personUnits: 70, // グリフの高さ（ユニット）。scale = 身長px / personUnits
    // 人物がフレーム縦幅に対して大きくなりすぎた場合の上限（近距離×望遠でのはみ出し対策）
    maxPersonFrameRatio: 0.88,
    // 列間の縦オフセット（人物スケール単位）。正面から撮る想定なので列は縦に大きく開かず、
    // 前列の顔が後列の顎の下あたりに来る重なりにする。1頭=10ユニットなので10でちょうど顔1つ分
    faceStackUnits: 10,
    // 人物シルエットの色（頭と胴体が一体の単色シルエット）。最前列がこの色
    personColor: "#ccd2da",
    // 列の奥行き表現: 1列後ろに下がるごとに暗くする割合と、その上限
    rowShadeStep: 0.07,
    rowShadeMax: 0.4,
    // 広角パースの歪み表現の強さ。画面端（光軸から離れた）人物が横に伸びる現象を、
    // 水平画角θに対し stretchX = 1 + strength·(1/cos²θ − 1) で表す。
    // 0=なし、1=幾何学的に厳密な rectilinear の伸び。端が重なりすぎない中間値が見やすい
    edgeDistortionStrength: 0.55,
    edgeDistortionMax: 2.0, // 伸びの上限（極端な広角でも横伸びをこの倍率で頭打ち）
    // 歪みが気になり始める横伸び倍率。ここから警告色を混ぜ始め、warnFull で最も濃くなる
    edgeWarnStart: 1.1,
    edgeWarnFull: 1.45,
    edgeWarnMaxTint: 0.85, // 警告色の最大混合率（1.0で完全に警告色）
    warnColor: "#ff5a4d", // 歪み注意の赤
    // ピントを合わせる人物のハイライト色
    focusColor: "#ffb340",
  },
};

const slider = document.getElementById("peopleSlider");
const distanceSlider = document.getElementById("distanceSlider");
const focalSlider = document.getElementById("focalSlider");
const fullFrameButton = document.getElementById("fullFrameButton");
const apscButton = document.getElementById("apscButton");
const peopleValue = document.getElementById("peopleValue");
const distanceControlValue = document.getElementById("distanceControlValue");
const focalControlValue = document.getElementById("focalControlValue");
const rowValue = document.getElementById("rowValue");
const apertureValue = document.getElementById("apertureValue");
const apertureMinValue = document.getElementById("apertureMinValue");
const depthValue = document.getElementById("depthValue");
const densityValue = document.getElementById("densityValue");
const distributionValue = document.getElementById("distributionValue");
const distanceValue = document.getElementById("distanceValue");
const frameWidthValue = document.getElementById("frameWidthValue");
const dofValue = document.getElementById("dofValue");
const warnLegend = document.getElementById("warnLegend");
const lineupSvg = document.getElementById("lineupSvg");

let sensorType = "full-frame";

function getSensor() {
  return CONFIG.sensors[sensorType];
}

function getHorizontalFrameWidth(distanceM, focalMm) {
  const angle = 2 * Math.atan(getSensor().widthMm / (2 * focalMm));
  return 2 * distanceM * Math.tan(angle / 2);
}

function getPersonPitchM() {
  return CONFIG.lineup.shoulderPitchM;
}

function getMinRows(count) {
  return CONFIG.lineup.minRowsTiers.find((tier) => count <= tier.maxCount).rows;
}

function getRowCount(count, frameWidthM) {
  const { usableWidthRatio, minUsableWidthM, maxRows } = CONFIG.lineup;
  const usableWidthM = Math.max(frameWidthM * usableWidthRatio, minUsableWidthM);
  const rowCapacity = Math.max(1, Math.floor(usableWidthM / getPersonPitchM(count)));
  const widthRows = Math.ceil(count / rowCapacity);
  return Math.min(maxRows, Math.max(1, widthRows, getMinRows(count)));
}

// 端数は後列に寄せる（前列は少なめが集合写真の定石）。index 0 = 最後列
function distributePeople(count, rows) {
  const base = Math.floor(count / rows);
  const extra = count % rows;
  return Array.from({ length: rows }, (_, index) => base + (index < extra ? 1 : 0));
}

// 集団の奥行き = 列間 ×(列数-1) + 身体の厚み余裕
function getGroupDepthM(rows) {
  return (rows - 1) * CONFIG.lineup.rowGapM + CONFIG.lineup.bodyDepthM;
}

// 被写界深度から必要F値を逆算する。
// 前提: 被写体距離 = 最前列までの距離。ピントは前端・後端を同時に収める
// 最適位置（調和平均 2·near·far/(near+far)）に合わせる。
// このとき必要な過焦点距離は H = 2·near·far/(far−near) で、
// H ≈ f²/(N·c) + f から N を逆算できる。
// 戻り値は「最低F値（物理計算そのまま）」と「推奨F値（安全マージン込み）」の2本立て。
// recommendedN は被写界深度の実レンジ計算に使う、推奨で実際にカメラにセットするF値（数値）
function getApertureAdvice(distanceM, groupDepthM, focalMm) {
  const { safetyStops, minN, maxN, stops } = CONFIG.aperture;
  const cocMm = getSensor().cocMm;
  const nearMm = distanceM * 1000;
  const farMm = (distanceM + groupDepthM) * 1000;
  const neededHyperfocalMm = (2 * nearMm * farMm) / (farMm - nearMm);
  const rawN = (focalMm * focalMm) / (cocMm * (neededHyperfocalMm - focalMm));
  const pickStop = (n) => stops.find((s) => s >= n - 0.01) ?? null;
  const withMarginN = Math.max(rawN * Math.SQRT2 ** safetyStops, minN);
  const recommendedStop = pickStop(withMarginN);
  return {
    min: pickStop(rawN) ? `F${pickStop(rawN)}` : `F${maxN}+`,
    recommended: recommendedStop ? `F${recommendedStop}` : `F${maxN}+`,
    recommendedN: recommendedStop ?? maxN,
  };
}

// 指定F値での実際の被写界深度の前後端（m）。ピントは集団の前後端の調和平均に置く前提。
// s < 過焦点距離H なら後端は有限、s ≥ H なら後端は無限遠（∞）。
function getDepthOfField(distanceM, groupDepthM, focalMm, apertureN) {
  const f = focalMm;
  const cocMm = getSensor().cocMm;
  const nearM = distanceM;
  const farM = distanceM + groupDepthM;
  const focusMm = ((2 * nearM * farM) / (nearM + farM)) * 1000;
  const hyperfocalMm = (f * f) / (apertureN * cocMm) + f;
  const nearLimitMm = (focusMm * (hyperfocalMm - f)) / (hyperfocalMm + focusMm - 2 * f);
  const farLimitMm =
    focusMm < hyperfocalMm ? (focusMm * (hyperfocalMm - f)) / (hyperfocalMm - focusMm) : Infinity;
  return { nearM: nearLimitMm / 1000, farM: farLimitMm / 1000 };
}

function getDensity(count, rows, frameWidthM) {
  const { roomyM, standardM, tightM } = CONFIG.density;
  const perRow = Math.ceil(count / rows);
  const pitch = (frameWidthM * CONFIG.lineup.usableWidthRatio) / perRow;
  if (pitch >= roomyM) return { label: "余裕あり", level: "ok" };
  if (pitch >= standardM) return { label: "標準", level: "normal" };
  if (pitch >= tightM) return { label: "やや密集", level: "tight" };
  return { label: "分割推奨", level: "split" };
}

// #rrggbb を amount(0〜1) ぶん黒方向に暗くする
function shadeColor(hex, amount) {
  const channels = [1, 3, 5].map((i) => {
    const value = Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - amount));
    return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

// hexA → hexB を t(0〜1) で線形補間
function mixColor(hexA, hexB, t) {
  const channels = [1, 3, 5].map((i) => {
    const a = parseInt(hexA.slice(i, i + 2), 16);
    const b = parseInt(hexB.slice(i, i + 2), 16);
    return Math.round(a + (b - a) * t)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

// 1人 = 身長165cm・7頭身の一体シルエット（単色・フラット）。
// 座標系はユニット（高さ70 ≒ 7頭 × 10）。原点 = 頭（顔）の中心。
// 頭: 円 r5.5（頭頂 -5.5。肩幅とのバランスでやや大きめ）／
// 肩: y14・半幅9（全幅18ユニット ≒ 0.42m = shoulderPitchM と一致、隣同士がちょうど肩を寄せて触れ合う）／
// 腰: y36・半幅7 ／ 股下 y38 から2本の脚（足元 y65）。
// 脚の間に細い切り込みを入れて「どこまでが足か」を分かるようにしている（立体表現はしない）。
// 頭部円弧のarcはsweep=1（0だとキャミソール形に化けるので注意）
// stretchX = 広角パースによる横方向の伸び（1=等倍。中心線まわりに左右対称に伸ばす）
function personGroup(x, y, scale, isFocus = false, rowColor = CONFIG.visual.personColor, stretchX = 1) {
  const color = isFocus ? CONFIG.visual.focusColor : rowColor;
  const glow = isFocus
    ? '<circle cx="0" cy="18" r="30" fill="rgba(255,179,64,0.16)" />'
    : "";
  return `
    <g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${(scale * stretchX).toFixed(4)} ${scale.toFixed(4)})">
      ${glow}
      <ellipse cx="0" cy="66" rx="10" ry="2.6" fill="rgba(0,0,0,0.4)" />
      <path d="M -9 14
               Q -9 8 -4.4 3.3
               A 5.5 5.5 0 1 1 4.4 3.3
               Q 9 8 9 14
               L 7 36
               L 6.2 63
               Q 6.2 65 4.6 65
               L 2.6 65
               Q 1.7 65 1.7 63
               L 1.3 40
               L 0 38
               L -1.3 40
               L -1.7 63
               Q -1.7 65 -2.6 65
               L -4.6 65
               Q -6.2 65 -6.2 63
               L -7 36
               Z" fill="${color}" />
    </g>
  `;
}

// 自前生成したSVG文字列をパースして差し込む（innerHTMLは使わない）
function replaceSvgContent(markup) {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`,
    "image/svg+xml"
  );
  lineupSvg.replaceChildren(...doc.documentElement.childNodes);
}

function renderLineup() {
  const count = Number(slider.value);
  const distanceM = Number(distanceSlider.value);
  const focalMm = Number(focalSlider.value);
  const horizontalFrameM = getHorizontalFrameWidth(distanceM, focalMm);
  const rows = getRowCount(count, horizontalFrameM);
  const distribution = distributePeople(count, rows);
  const groupDepthM = getGroupDepthM(rows);
  const frameWidth = 520;
  const { visual } = CONFIG;
  let svg = "";
  // 人物サイズは実寸ベース: 身長1.65m × その列の実距離でのpx/m ÷ グリフ高さ(70ユニット)。
  // 画角に対する人の大きさが物理的に正しく出る（近距離×望遠では上限でクランプ）
  const personPitchM = getPersonPitchM();
  const frameHeight = 347; // viewBox縦（3:2横位置）
  const maxScale = (frameHeight * visual.maxPersonFrameRatio) / visual.personUnits;
  const rowScales = distribution.map((_, rowIndex) => {
    const dM = distanceM + CONFIG.lineup.rowGapM * (rows - 1 - rowIndex);
    const pxPerM = frameWidth / getHorizontalFrameWidth(dM, focalMm);
    return Math.min(maxScale, (visual.personHeightM * pxPerM) / visual.personUnits);
  });
  // 縦位置: 正面カメラ想定で列間は顔1つぶん強の重なりにする（faceStackUnits参照）。
  // ys[0] = 最後列。前の列ほど下に来て、後列の身体に重なる
  const ys = [0];
  for (let i = 1; i < rows; i += 1) {
    ys.push(ys[i - 1] + visual.faceStackUnits * rowScales[i - 1]);
  }
  // 描画全体（最後列の頭頂〜最前列の裾）をフレーム縦中央に寄せる
  // フレームは35mm判の横位置3:2（viewBox 520×347）。縦中央 = 347/2
  // グリフは原点=顔中心で、頭頂 -5.5 〜 影の下端 +69 ユニット
  const stackTop = ys[0] - 5.5 * rowScales[0];
  const stackBottom = ys[rows - 1] + 69 * rowScales[rows - 1];
  const yOffset = 173.5 - (stackTop + stackBottom) / 2;
  for (let i = 0; i < rows; i += 1) ys[i] += yOffset;

  // ピントを合わせる人物: 前後端を同時に収める最適ピント距離（調和平均）に
  // 最も近い列の、中央の1人（F値計算と同じ前提）
  const nearM = distanceM;
  const farM = distanceM + groupDepthM;
  const focusDistanceM = (2 * nearM * farM) / (nearM + farM);
  let focusRowIndex = 0;
  let bestDiff = Infinity;
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const d = distanceM + CONFIG.lineup.rowGapM * (rows - 1 - rowIndex);
    const diff = Math.abs(d - focusDistanceM);
    if (diff < bestDiff) {
      bestDiff = diff;
      focusRowIndex = rowIndex;
    }
  }

  // 互い違い配置: 全列を共通の物理ピッチ格子に載せ、隣の列は正確に半ピッチずらす。
  // 横位置の投影は全列で共通（前列の画角幅基準）にし、奇数列同士・偶数列同士が
  // 完全に揃うグリッドにする（列距離ごとに投影すると遠近で横方向がズレるため使わない）。
  // 人物の大きさだけは列の実距離でスケールし、奥行きの遠近感を残す
  const sharedPxPerM = frameWidth / horizontalFrameM;
  const maxExtentPx = Math.max(
    ...distribution.map((rowCount) => ((rowCount - 1) / 2 + 0.5) * personPitchM * sharedPxPerM * 2)
  );
  const fitRatio = Math.min(1, (frameWidth * 0.94) / maxExtentPx);
  const pitchM = personPitchM * fitRatio;

  // 格子上の位相: 奇数人数の列は整数ピッチ位置、偶数人数の列は半ピッチ位置に自然に載る。
  // 列番号の偶奇で目標の位相を決め、ずれていれば半ピッチ補正して互い違いを保証する
  const staggers = distribution.map((rowCount, rowIndex) => {
    const naturalHalf = rowCount % 2 === 0;
    const desiredHalf = rowIndex % 2 === 1;
    return naturalHalf !== desiredHalf ? pitchM / 2 : 0;
  });
  // 半ピッチ補正で全体が片側に寄るため、左右の張り出しの中点をフレーム中央に合わせる
  const leftM = Math.min(...distribution.map((c, i) => -((c - 1) / 2) * pitchM + staggers[i]));
  const rightM = Math.max(...distribution.map((c, i) => ((c - 1) / 2) * pitchM + staggers[i]));
  const centerM = (leftM + rightM) / 2;

  let anyWarn = false; // 歪み警告色が付いた人物が1人でもいるか（凡例の出し分けに使う）
  distribution.forEach((rowCount, rowIndex) => {
    const y = ys[rowIndex];
    const rowScale = rowScales[rowIndex];
    // 後方の列ほど少し暗くして奥行きを出す（最前列 = rowIndex rows-1 が基準色）
    const depthFromFront = rows - 1 - rowIndex;
    const shade = Math.min(visual.rowShadeMax, depthFromFront * visual.rowShadeStep);
    const rowColor = shadeColor(visual.personColor, shade);

    for (let index = 0; index < rowCount; index += 1) {
      const xM = (index - (rowCount - 1) / 2) * pitchM + staggers[rowIndex] - centerM;
      const x = frameWidth / 2 + xM * sharedPxPerM;
      // パース歪み: 光軸(フレーム中央)からの水平画角θが大きいほど横に伸びる（広角で顕著）。
      // θは方向だけで決まるので前列基準の距離を使い、同じ列(同じ画面位置)は同じ伸びで揃える。
      // realXm は表示圧縮(fitRatio)を戻した実際の横位置
      const realXm = Math.abs(xM) / fitRatio;
      const theta = Math.atan(realXm / distanceM);
      const stretchX = Math.min(
        visual.edgeDistortionMax,
        1 + visual.edgeDistortionStrength * (1 / Math.cos(theta) ** 2 - 1)
      );
      // 歪みが強い人物は警告色(赤)を混ぜる。warnStart〜warnFull で 0→最大混合率
      const warnT =
        (stretchX - visual.edgeWarnStart) / (visual.edgeWarnFull - visual.edgeWarnStart);
      const warnAmount = Math.max(0, Math.min(1, warnT)) * visual.edgeWarnMaxTint;
      if (warnAmount > 0) anyWarn = true;
      const isFocus = rowIndex === focusRowIndex && index === Math.round((rowCount - 1) / 2);
      const bodyColor = warnAmount > 0 ? mixColor(rowColor, visual.warnColor, warnAmount) : rowColor;
      svg += personGroup(x, y, rowScale, isFocus, bodyColor, stretchX);
    }
  });

  replaceSvgContent(svg);
  warnLegend.hidden = !anyWarn; // 歪み注意の凡例は、警告色が付いたときだけ出す
  peopleValue.value = `${count}人`;
  distanceControlValue.value = `${distanceM.toFixed(1)}m`;
  focalControlValue.value = `${focalMm}mm`;
  rowValue.textContent = `${rows}`;
  const aperture = getApertureAdvice(distanceM, groupDepthM, focalMm);
  apertureValue.textContent = aperture.recommended;
  apertureMinValue.textContent = `最低 ${aperture.min} +${CONFIG.aperture.safetyStops}段`;
  depthValue.textContent = `${groupDepthM.toFixed(1)}m`;
  // 推奨F値でのピントが合う実レンジ（被写界深度の前後端）
  const dof = getDepthOfField(distanceM, groupDepthM, focalMm, aperture.recommendedN);
  dofValue.textContent =
    dof.farM === Infinity
      ? `${dof.nearM.toFixed(1)}m〜∞`
      : `${dof.nearM.toFixed(1)}〜${dof.farM.toFixed(1)}m`;
  const density = getDensity(count, rows, horizontalFrameM);
  densityValue.textContent = density.label;
  densityValue.dataset.level = density.level;
  // distribution は後列→前列の順なので、表示は前列からに反転する
  distributionValue.textContent = [...distribution].reverse().join(" / ");
  frameWidthValue.textContent = `${horizontalFrameM.toFixed(1)}m`;
  distanceValue.textContent = `${Math.round(focalMm * getSensor().cropFactor)}mm`;
}

function setSensor(type) {
  sensorType = type;
  fullFrameButton.classList.toggle("active", type === "full-frame");
  apscButton.classList.toggle("active", type === "apsc");
  renderLineup();
}

function updateSliderFill(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const ratio = (Number(input.value) - min) / (max - min);
  input.style.setProperty("--fill", `${(ratio * 100).toFixed(1)}%`);
}

[slider, distanceSlider, focalSlider].forEach((input) => {
  input.addEventListener("input", () => {
    updateSliderFill(input);
    renderLineup();
  });
  updateSliderFill(input);
});

fullFrameButton.addEventListener("click", () => setSensor("full-frame"));
apscButton.addEventListener("click", () => setSensor("apsc"));

renderLineup();
