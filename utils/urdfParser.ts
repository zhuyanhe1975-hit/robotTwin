
import { RobotModel, JointConfig, LinkConfig, RobotNode, Vector3, JointType, LinkDynamics } from '../types';

const parseVector3 = (str: string | null): Vector3 => {
  if (!str) return { x: 0, y: 0, z: 0 };
  const parts = str.trim().split(/\s+/).map(parseFloat);
  return { x: parts[0] || 0, y: parts[1] || 0, z: parts[2] || 0 };
};

export const parseURDF = (xmlContent: string): RobotModel => {
  const parser = new DOMParser();
  // Ensure content is trimmed to avoid "XML declaration allowed only at the start" errors
  const xmlDoc = parser.parseFromString(xmlContent.trim(), "text/xml");
  const robotEl = xmlDoc.querySelector("robot");
  const robotName = robotEl?.getAttribute("name") || "Unnamed Robot";

  const links: Record<string, LinkConfig> = {};
  const joints: Record<string, JointConfig> = {};

  // Safety check: if robotEl is missing, parsing failed or content is invalid
  if (!robotEl) {
      console.warn("parseURDF: No <robot> tag found in XML");
  }

  // Parse Links with Dynamics
  xmlDoc.querySelectorAll("link").forEach(linkEl => {
    const name = linkEl.getAttribute("name");
    if (name) {
      let dynamics: LinkDynamics | undefined = undefined;
      const inertialEl = linkEl.querySelector("inertial");
      
      if (inertialEl) {
        const massEl = inertialEl.querySelector("mass");
        const inertiaEl = inertialEl.querySelector("inertia");
        
        if (massEl) {
           const massVal = parseFloat(massEl.getAttribute("value") || "0");
           const ixx = parseFloat(inertiaEl?.getAttribute("ixx") || "0");
           const iyy = parseFloat(inertiaEl?.getAttribute("iyy") || "0");
           const izz = parseFloat(inertiaEl?.getAttribute("izz") || "0");
           const ixy = parseFloat(inertiaEl?.getAttribute("ixy") || "0");
           const ixz = parseFloat(inertiaEl?.getAttribute("ixz") || "0");
           const iyz = parseFloat(inertiaEl?.getAttribute("iyz") || "0");

           dynamics = {
             mass: massVal,
             inertia: { ixx, iyy, izz, ixy, ixz, iyz }
           };
        }
      }

      links[name] = { name, dynamics };
    }
  });

  // Parse Joints
  const childLinks = new Set<string>();
  
  xmlDoc.querySelectorAll("joint").forEach(jointEl => {
    const name = jointEl.getAttribute("name");
    const type = jointEl.getAttribute("type") as JointType || JointType.FIXED;
    const parent = jointEl.querySelector("parent")?.getAttribute("link");
    const child = jointEl.querySelector("child")?.getAttribute("link");
    const limitEl = jointEl.querySelector("limit");
    const originEl = jointEl.querySelector("origin");

    if (name && parent && child) {
      childLinks.add(child);
      joints[name] = {
        name,
        type,
        parentLink: parent,
        childLink: child,
        origin: { 
            xyz: parseVector3(originEl?.getAttribute("xyz") || "0 0 0"), 
            rpy: parseVector3(originEl?.getAttribute("rpy") || "0 0 0") 
        },
        axis: parseVector3(jointEl.querySelector("axis")?.getAttribute("xyz") || "1 0 0"),
        limit: limitEl ? {
          lower: parseFloat(limitEl.getAttribute("lower") || "-3.14"),
          upper: parseFloat(limitEl.getAttribute("upper") || "3.14")
        } : undefined,
        currentValue: 0
      };
    }
  });

  // Determine Root Link (A link that is never a child)
  const allLinkNames = Object.keys(links);
  const rootLink = allLinkNames.find(name => !childLinks.has(name)) || allLinkNames[0] || "base_link";

  // Build Tree Structure
  const buildTree = (currentLinkName: string): RobotNode => {
    const node: RobotNode = {
      linkName: currentLinkName,
      children: []
    };

    // Find all joints where parent is currentLinkName
    Object.values(joints).forEach(joint => {
      if (joint.parentLink === currentLinkName) {
        node.children.push({
          jointName: joint.name,
          childNode: buildTree(joint.childLink)
        });
      }
    });

    return node;
  };

  const tree = buildTree(rootLink);

  return {
    name: robotName,
    rootLink,
    links,
    joints,
    tree
  };
};
