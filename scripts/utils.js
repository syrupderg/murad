export const state = {
    selectedLoader: "fabric",
    selectedTargetVersions: ["26.1.2"],
    scannedMods: [],
    mcVersionsCache: [],
    currentSortMode: "COMP",
    nameSortDir: 1,
    compSortDir: 1,
    catSortDirs: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 },
    searchQuery: "",
    pendingOverrideDataStr: "",
    pendingOverrideFileName: "",
    projectNameCache: {},
};

export const PRIORITY = { GREEN: 1, YELLOW: 2, RED: 3, NOT_FOUND: 4, CHECKING: 5, RESOURCE_SHADER: 6 };
export const PRIORITY_NAMES = {
    1: "Compatible",
    2: "Kinda Compatible",
    3: "Incompatible",
    4: "Not Found",
    5: "Checking / Errors",
    6: "Shaders & Resource Packs",
};

export const VERSION_GROUPS = [
    { name: "26.1.2-26.1", versions: ["26.1.2", "26.1.1", "26.1"] },
    { name: "1.21.11", versions: ["1.21.11"] },
    { name: "1.21.10-1.21.9", versions: ["1.21.10", "1.21.9"] },
    { name: "1.21.8-1.21.7", versions: ["1.21.8", "1.21.7"] },
    { name: "1.21.6", versions: ["1.21.6"] },
    { name: "1.21.5", versions: ["1.21.5"] },
    { name: "1.21.4", versions: ["1.21.4"] },
    { name: "1.21.3-1.21.2", versions: ["1.21.3", "1.21.2"] },
    { name: "1.21.1-1.21", versions: ["1.21.1", "1.21"] },
    { name: "1.20.6-1.20.5", versions: ["1.20.6", "1.20.5"] },
    { name: "1.20.4-1.20.3", versions: ["1.20.4", "1.20.3"] },
    { name: "1.20.2", versions: ["1.20.2"] },
    { name: "1.20.1-1.20", versions: ["1.20.1", "1.20"] },
];

export const LOADER_FILES = {
    fabric: "icons/fabric.svg",
    quilt: "icons/quilt.svg",
    forge: "icons/forge.svg",
    neoforge: "icons/neoforge.svg",
    optifine: "icons/optifine.svg",
    iris: "icons/iris.svg",
};

export const TINY_LOADER_FILES = {
    fabric: "icons/fabric-tiny.svg",
    quilt: "icons/quilt-tiny.svg",
    forge: "icons/forge-tiny.svg",
    neoforge: "icons/neoforge-tiny.svg",
    optifine: "icons/optifine-tiny.svg",
    iris: "icons/iris-tiny.svg",
};

export const LOADER_COLORS = {
    fabric: "#dbb69b",
    quilt: "#c796f9",
    neoforge: "#f99e6b",
    forge: "#959eef",
    optifine: "#FFC526",
    iris: "#448aff",
};

export const LOADER_SORT_ORDER = {
    fabric: 1,
    quilt: 2,
    neoforge: 3,
    forge: 4,
    iris: 5,
    optifine: 6,
};

export function isValidRelease(v) {
    return /^\d+\.\d+(\.\d+)?$/.test(v);
}

export function parseVersion(v) {
    let parts = v.split(".").map(Number);
    return { original: v, maj: parts[0] || 0, min: parts[1] || 0, pat: parts[2] || 0 };
}

export function isAtLeast1_20(v) {
    let p = parseVersion(v);
    if (p.maj > 1) return true;
    if (p.maj === 1 && p.min >= 20) return true;
    return false;
}

export function timeAgo(dateString) {
    const date = new Date(dateString);
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = Math.floor(seconds / 31536000);
    if (interval > 1) return interval + " years ago";
    if (interval === 1) return "last year";
    interval = Math.floor(seconds / 2592000);
    if (interval > 1) return interval + " months ago";
    if (interval === 1) return "last month";
    interval = Math.floor(seconds / 86400);
    if (interval > 1) return interval + " days ago";
    if (interval === 1) return "yesterday";
    interval = Math.floor(seconds / 3600);
    if (interval > 1) return interval + " hours ago";
    if (interval === 1) return "1 hour ago";
    interval = Math.floor(seconds / 60);
    if (interval > 1) return interval + " minutes ago";
    if (interval === 1) return "1 minute ago";
    return "just now";
}

export async function getFileHash(file) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-1", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

export function getHighestVersion(versionsArray) {
    if (!versionsArray || versionsArray.length === 0) return null;
    return versionsArray.sort((a, b) => {
        let pA = a.split(".").map(Number),
            pB = b.split(".").map(Number);
        for (let i = 0; i < Math.max(pA.length, pB.length); i++) {
            let nA = pA[i] || 0,
                nB = pB[i] || 0;
            if (nA !== nB) return nB - nA;
        }
        return 0;
    })[0];
}

export function getGroupForVersion(v) {
    for (let g of VERSION_GROUPS) {
        if (g.versions.includes(v)) return g.versions;
    }
    return [v];
}

export function getLoaderVersionRanges(apiData) {
    if (!apiData || apiData === "ERROR" || apiData.length === 0) return {};
    let loaderVersions = {};

    const allowedLoaders = ["fabric", "quilt", "forge", "neoforge", "iris", "optifine"];

    apiData.forEach((release) => {
        release.loaders.forEach((l) => {
            const safeLoader = l.toLowerCase();

            if (!allowedLoaders.includes(safeLoader)) return;

            if (!loaderVersions[safeLoader]) loaderVersions[safeLoader] = new Set();
            release.game_versions.forEach((v) => {
                if (isValidRelease(v) && isAtLeast1_20(v)) loaderVersions[safeLoader].add(v);
            });
        });
    });

    let ranges = {};
    for (let l in loaderVersions) {
        if (loaderVersions[l].size > 0) {
            let parsed = Array.from(loaderVersions[l]).map(parseVersion);
            let groups = {};
            parsed.forEach((p) => {
                let key = `${p.maj}.${p.min}`;
                if (!groups[key]) groups[key] = [];
                groups[key].push(p);
            });
            let allRanges = [];
            for (let key in groups) {
                let sorted = groups[key].sort((a, b) => a.pat - b.pat);
                let start = sorted[0],
                    prev = sorted[0];
                for (let i = 1; i < sorted.length; i++) {
                    let curr = sorted[i];
                    if (curr.pat === prev.pat + 1) {
                        prev = curr;
                    } else {
                        allRanges.push(
                            start.original === prev.original ? start.original : `${start.original}–${prev.original}`
                        );
                        start = curr;
                        prev = curr;
                    }
                }
                allRanges.push(
                    start.original === prev.original ? start.original : `${start.original}–${prev.original}`
                );
            }
            allRanges.sort((a, b) => {
                let pA = parseVersion(a.split("–")[0]),
                    pB = parseVersion(b.split("–")[0]);
                if (pA.maj !== pB.maj) return pA.maj - pB.maj;
                if (pA.min !== pB.min) return pA.min - pB.min;
                return pA.pat - pB.pat;
            });
            ranges[l] = allRanges;
        }
    }
    return ranges;
}

export async function extractTarArchive(file) {
    let buffer;

    if (file.name.endsWith(".gz") || file.name.endsWith(".tgz")) {
        const ds = new DecompressionStream("gzip");
        const stream = file.stream().pipeThrough(ds);
        const response = new Response(stream);
        buffer = await response.arrayBuffer();
    } else {
        buffer = await file.arrayBuffer();
    }

    const files = [];
    let offset = 0;
    const uint8 = new Uint8Array(buffer);
    const decoder = new TextDecoder("utf-8");

    while (offset < uint8.length - 512) {
        const header = uint8.subarray(offset, offset + 512);
        if (header[0] === 0) break;

        const nameBytes = header.subarray(0, 100);
        let nameLen = 0;
        while (nameLen < 100 && nameBytes[nameLen] !== 0) nameLen++;
        const name = decoder.decode(nameBytes.subarray(0, nameLen));

        const sizeBytes = header.subarray(124, 136);
        let sizeStr = decoder.decode(sizeBytes).replace(/\0/g, "").trim();
        const size = parseInt(sizeStr, 8) || 0;

        const typeflag = String.fromCharCode(header[156]);
        const isFile = typeflag === "0" || typeflag === "\0";

        offset += 512;

        if (isFile && size > 0 && (name.endsWith(".jar") || name.endsWith(".zip"))) {
            const fileData = uint8.subarray(offset, offset + size);
            const blob = new Blob([fileData]);
            blob.name = name.split("/").pop();
            files.push(blob);
        }

        offset += Math.ceil(size / 512) * 512;
    }
    return files;
}
