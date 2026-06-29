import { state, isVersionAllowed } from "./utils.js";
import { renderSidebar } from "./ui.js";

export async function loadMcVersions() {
    try {
        const res = await fetch("https://api.modrinth.com/v2/tag/game_version");
        const data = await res.json();
        
        data.sort((a, b) => new Date(b.date) - new Date(a.date));
        state.rawMcVersions = data;
        
        updateVersionsCache();
    } catch (e) {
        console.error("Failed to load MC versions", e);
    }
}

export function updateVersionsCache() {
    state.mcVersionsCache = state.rawMcVersions.filter((v) => {
        if (!isVersionAllowed(v.version)) return false;
        if (!state.includeSnapshots && v.version_type !== "release") return false;

        return true;
    });

    renderSidebar();
}

export async function parseJar(file) {
    const zip = new JSZip();
    try {
        const contents = await zip.loadAsync(file);
        const fabricJson = contents.file("fabric.mod.json");
        if (fabricJson) {
            const rawData = await fabricJson.async("string");
            const json = JSON.parse(rawData.replace(/[\x00-\x1F]/g, ""));
            return { id: json.id, name: json.name || json.id, version: json.version };
        }
    } catch (e) {
        console.warn(`Parse error:`, e);
    }
    return null;
}

export async function fetchModData(mod) {
    try {
        let hashRes = await fetch(`https://api.modrinth.com/v2/version_file/${mod.fileHash}?algorithm=sha1`);
        if (hashRes.ok) {
            const hashData = await hashRes.json();
            const projRes = await fetch(`https://api.modrinth.com/v2/project/${hashData.project_id}`);
            if (projRes.ok) {
                const projData = await projRes.json();
                mod.project_type = projData.project_type;
                if (mod.version === "mrpack" || mod.version === "Unknown") {
                    mod.name = projData.title;
                    mod.id = projData.slug;
                }
            }
            const allRes = await fetch(`https://api.modrinth.com/v2/project/${hashData.project_id}/version`);
            mod.apiData = await allRes.json();
            return;
        }
        let projectId = mod.id;
        let projectRes = await fetch(`https://api.modrinth.com/v2/project/${projectId}`);
        if (!projectRes.ok) {
            const searchRes = await fetch(
                `https://api.modrinth.com/v2/search?query=${encodeURIComponent(mod.name)}&limit=5`
            );
            const searchData = await searchRes.json();
            const exactHit = searchData.hits.find(
                (hit) =>
                    hit.slug.toLowerCase() === mod.id.toLowerCase() ||
                    hit.title.toLowerCase() === mod.name.toLowerCase()
            );
            if (exactHit) {
                projectId = exactHit.project_id;
            } else {
                throw new Error("Strict match not found");
            }
            projectRes = await fetch(`https://api.modrinth.com/v2/project/${projectId}`);
        }
        if (projectRes.ok) {
            const projData = await projectRes.json();
            mod.project_type = projData.project_type;
        }
        const allRes = await fetch(`https://api.modrinth.com/v2/project/${projectId}/version`);
        mod.apiData = await allRes.json();
    } catch (e) {
        mod.apiData = "ERROR";
    }
}