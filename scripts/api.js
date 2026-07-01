import { state, isVersionAllowed } from "./utils.js";
import { renderSidebar } from "./ui.js";

const CF_WORKER_URL = "https://murad.syrupderg.workers.dev";

async function fetchWithRetry(url, options = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
        const response = await fetch(url, options);
        if (response.status === 429) {
            await new Promise(resolve => setTimeout(resolve, 1500 * Math.pow(2, i)));
            continue;
        }
        return response;
    }
    return fetch(url, options);
}

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

async function fetchCurseForgeData(mod) {
    let exactHit;

    if (mod.type === "curseforge") {
        const projRes = await fetchWithRetry(`${CF_WORKER_URL}/v1/mods/${mod.id}`);
        if (!projRes.ok) throw new Error("CurseForge project not found");
        const projData = await projRes.json();
        if (!projData.data) throw new Error("CurseForge project data empty");
        
        exactHit = projData.data;
        mod.name = exactHit.name;
    } else {
        const searchRes = await fetchWithRetry(`${CF_WORKER_URL}/v1/mods/search?gameId=432&searchFilter=${encodeURIComponent(mod.name)}&pageSize=50`);
        if (!searchRes.ok) throw new Error("CurseForge API error");
        
        const searchData = await searchRes.json();
        if (!searchData.data || searchData.data.length === 0) throw new Error("Not found on CurseForge");

        const validHits = searchData.data.filter(hit => hit.classId === 6 || hit.classId === 12 || hit.classId === 6552);

        exactHit = validHits.find(hit => 
            hit.slug.toLowerCase() === mod.id.toLowerCase() || 
            hit.name.toLowerCase() === mod.name.toLowerCase()
        );

        if (!exactHit) {
            const normalize = (str) => str.toLowerCase().replace(/[-_\s]/g, "");
            const modIdNorm = normalize(mod.id);
            const modNameNorm = normalize(mod.name);
            
            exactHit = validHits.find(hit => 
                normalize(hit.slug) === modIdNorm || 
                normalize(hit.name) === modNameNorm
            );
        }
        if (!exactHit) throw new Error("Strict match not found on CurseForge");
    }

    mod.project_type = exactHit.classId === 12 ? "resourcepack" : (exactHit.classId === 6552 ? "shader" : "mod");
    mod.project_downloads = exactHit.downloadCount;
    mod.project_date_modified = exactHit.dateModified;

    let allFiles = [];
    const firstRes = await fetchWithRetry(`${CF_WORKER_URL}/v1/mods/${exactHit.id}/files?index=0&pageSize=50`);
    const firstData = await firstRes.json();

    if (firstData.data && firstData.data.length > 0) {
        allFiles.push(...firstData.data);
        const totalCount = firstData.pagination ? firstData.pagination.totalCount : firstData.data.length;

        let fetchPromises = [];
        for (let i = 50; i < totalCount; i += 50) {
            fetchPromises.push(
                fetchWithRetry(`${CF_WORKER_URL}/v1/mods/${exactHit.id}/files?index=${i}&pageSize=50`)
                .then(r => r.json())
                .then(d => d.data || [])
            );
        }

        while (fetchPromises.length > 0) {
            const chunk = fetchPromises.splice(0, 5);
            const results = await Promise.all(chunk);
            for (const r of results) {
                allFiles.push(...r);
            }
        }
    }

    return allFiles.map(file => {
        const lowerVersions = file.gameVersions.map(v => v.toLowerCase());
        
        let loaders = [];
        if (lowerVersions.includes('fabric')) loaders.push('fabric');
        if (lowerVersions.includes('forge')) loaders.push('forge');
        if (lowerVersions.includes('neoforge')) loaders.push('neoforge');
        if (lowerVersions.includes('quilt')) loaders.push('quilt');
        
        if (loaders.length === 0 && mod.project_type !== "resourcepack") {
            const fName = file.fileName.toLowerCase();
            if (fName.includes('fabric')) loaders.push('fabric');
            if (fName.includes('forge')) loaders.push('forge');
            if (fName.includes('neoforge')) loaders.push('neoforge');
            
            if (loaders.length === 0) {
                loaders.push('forge');
            }
        }

        const mcVersions = file.gameVersions.filter(v => /^\d+\.\d+(\.\d+)?$/.test(v));

        let rType = "release";
        if (file.releaseType === 2) rType = "beta";
        else if (file.releaseType === 3) rType = "alpha";

        const sha1Hash = file.hashes ? file.hashes.find(h => h.algo === 1)?.value : "";

        return {
            version_number: file.fileName,
            version_type: rType,
            date_published: file.fileDate,
            game_versions: mcVersions,
            loaders: loaders,
            downloads: file.downloadCount,
            project_id: exactHit.id.toString(),
            project_slug: exactHit.slug,
            id: file.id.toString(),
            dependencies: file.dependencies.map(d => ({
                project_id: d.modId.toString(),
                dependency_type: d.relationType === 3 ? "required" : (d.relationType === 2 ? "optional" : "incompatible")
            })),
            files: [{
                primary: true,
                filename: file.fileName,
                url: file.downloadUrl,
                hashes: { sha1: sha1Hash },
                size: file.fileLength
            }]
        };
    });
}

export async function fetchModData(mod) {
    let combinedData = [];
    let projectId = mod.id;
    let resolvedOnModrinth = false;

    const runMr = mod.type !== "curseforge";
    const runCf = mod.type !== "modrinth";

    if (runMr) {
        try {
            let hashRes = await fetch(`https://api.modrinth.com/v2/version_file/${mod.fileHash}?algorithm=sha1`);
            if (hashRes.ok) {
                const hashData = await hashRes.json();
                const projRes = await fetch(`https://api.modrinth.com/v2/project/${hashData.project_id}`);
                if (projRes.ok) {
                    const projData = await projRes.json();
                    mod.project_type = projData.project_type;
                    mod.name = projData.title;
                    mod.id = projData.slug;
                    mod.project_downloads = projData.downloads;
                    mod.project_date_modified = projData.updated;
                }
                projectId = hashData.project_id;
                resolvedOnModrinth = true;
            } else {
                let projectRes = await fetch(`https://api.modrinth.com/v2/project/${projectId}`);
                let isModpackCollision = false;

                if (projectRes.ok) {
                    const projData = await projectRes.json();
                    if (projData.project_type === "modpack") {
                        isModpackCollision = true;
                    } else {
                        mod.project_type = projData.project_type;
                        mod.name = projData.title;
                        mod.id = projData.slug;
                        mod.project_downloads = projData.downloads;
                        mod.project_date_modified = projData.updated;
                        resolvedOnModrinth = true;
                    }
                }

                if (!projectRes.ok || isModpackCollision) {
                    const searchRes = await fetch(`https://api.modrinth.com/v2/search?query=${encodeURIComponent(mod.name)}&limit=50`);
                    const searchData = await searchRes.json();
                    const validHits = searchData.hits.filter(hit => hit.project_type === "mod" || hit.project_type === "resourcepack" || hit.project_type === "shader");
                    
                    let exactHit = validHits.find(hit => hit.slug.toLowerCase() === mod.id.toLowerCase() || hit.title.toLowerCase() === mod.name.toLowerCase());
                    if (!exactHit) {
                        const normalize = (str) => str.toLowerCase().replace(/[-_\s]/g, "");
                        const modIdNorm = normalize(mod.id);
                        const modNameNorm = normalize(mod.name);
                        exactHit = validHits.find(hit => normalize(hit.slug) === modIdNorm || normalize(hit.title) === modNameNorm);
                    }

                    if (exactHit) {
                        projectId = exactHit.project_id;
                        resolvedOnModrinth = true;
                        
                        const newProjectRes = await fetch(`https://api.modrinth.com/v2/project/${projectId}`);
                        if (newProjectRes.ok) {
                            const newProjData = await newProjectRes.json();
                            mod.project_type = newProjData.project_type;
                            mod.name = newProjData.title;
                            mod.id = newProjData.slug;
                            mod.project_downloads = newProjData.downloads;
                            mod.project_date_modified = newProjData.updated;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn("Modrinth identity resolution failed", e);
        }
    }

    const fetchModrinthVersions = async () => {
        if (!runMr) return [];
        if (!resolvedOnModrinth) throw new Error("Not resolved on Modrinth");
        const allRes = await fetch(`https://api.modrinth.com/v2/project/${projectId}/version`);
        if (!allRes.ok) throw new Error("Failed to fetch Modrinth versions");
        const versionsData = await allRes.json();
        if (!Array.isArray(versionsData)) throw new Error("Invalid Modrinth versions data");
        return versionsData;
    };

    const fetchCFVersions = async () => {
        if (!runCf) return [];
        return await fetchCurseForgeData(mod);
    };

    const [mrResult, cfResult] = await Promise.allSettled([fetchModrinthVersions(), fetchCFVersions()]);

    if (mrResult.status === "fulfilled" && Array.isArray(mrResult.value)) {
        combinedData.push(...mrResult.value);
    }
    
    if (cfResult.status === "fulfilled" && Array.isArray(cfResult.value)) {
        combinedData.push(...cfResult.value);
        
        if (mod.type === "curseforge" && mod.fileId) {
            const exactFile = cfResult.value.find(f => f.id === mod.fileId.toString());
            if (exactFile && exactFile.files[0] && exactFile.files[0].hashes.sha1) {
                mod.fileHash = exactFile.files[0].hashes.sha1; 
            }
        }
    }

    if (combinedData.length > 0) {
        mod.apiData = combinedData;
    } else {
        mod.apiData = "ERROR";
    }
}