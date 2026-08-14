/**
 * Publieke host voor verkorte links, afgeleid van de host waarop de admin wordt
 * bekeken: vtk.be -> on.vtk.be, main-dev.vtk.be -> on.main-dev.vtk.be.
 * Dit weerspiegelt dezelfde `on.`-conventie als proxy.ts.
 */
export function shortlinkDisplayHost(requestHost: string): string {
  const [hostname, port] = requestHost.toLowerCase().split(":");
  const labels = hostname.split(".");
  let target: string;
  if (labels[0] === "on") target = hostname;
  else if (labels[0] === "www") {
    labels[0] = "on";
    target = labels.join(".");
  } else {
    target = `on.${hostname}`;
  }
  return port ? `${target}:${port}` : target;
}

export function shortlinkPublicUrl(requestHost: string, slug: string): string {
  return `https://${shortlinkDisplayHost(requestHost)}/${slug}`;
}
