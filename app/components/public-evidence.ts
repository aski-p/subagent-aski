"use client";
import { useEffect, useState } from "react";
type Project = {
  name: string;
  fullName: string;
  htmlUrl: string;
  updatedAt: string;
};
type Run = {
  id: number;
  title: string;
  url: string;
  updatedAt: string;
  status: string;
};
type Entry = { runs: Run[]; error: boolean; checked: string | null };
export function usePublicEvidence(project: string) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsError, setProjectsError] = useState(false);
  const [projectsChecked, setProjectsChecked] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  useEffect(() => {
    let live = true;
    let version = 0;
    const refresh = async () => {
      const id = ++version;
      try {
        const r = await fetch("/api/projects", { cache: "no-store" });
        if (!r.ok) throw Error();
        const d = await r.json();
        if (!Array.isArray(d.projects)) throw Error();
        if (live && id === version) {
          setProjects(d.projects);
          setProjectsError(false);
          setProjectsChecked(new Date().toISOString());
        }
      } catch {
        if (live && id === version) setProjectsError(true);
      }
    };
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 30000);
    return () => {
      live = false;
      version++;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!project) return;
    let live = true;
    let version = 0;
    const refresh = async () => {
      const id = ++version;
      try {
        const r = await fetch(
          "/api/projects/" + encodeURIComponent(project) + "/runs",
          { cache: "no-store" },
        );
        if (!r.ok) throw Error();
        const d = await r.json();
        if (!Array.isArray(d.runs)) throw Error();
        if (live && id === version)
          setEntries((e) => ({
            ...e,
            [project]: {
              runs: d.runs,
              error: false,
              checked: new Date().toISOString(),
            },
          }));
      } catch {
        if (live && id === version)
          setEntries((e) => ({
            ...e,
            [project]: {
              runs: e[project]?.runs ?? [],
              checked: e[project]?.checked ?? null,
              error: true,
            },
          }));
      }
    };
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 30000);
    return () => {
      live = false;
      version++;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [project]);
  return {
    projects,
    projectsError,
    projectsChecked,
    runs: entries[project]?.runs ?? [],
    runsError: entries[project]?.error ?? false,
    runsChecked: entries[project]?.checked ?? null,
  };
}
