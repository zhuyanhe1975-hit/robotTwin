
export const APP_VERSION = 'R2';

export const DEFAULT_CAMERA_POSITION = [2, 2, 2] as const;

export interface RobotCatalogEntry {
  id: string;
  name: string;
  manufacturer: string;
  urdfPath: string; // Path relative to public/ e.g. "data/abb_irb2400_support/urdf/irb2400.urdf"
  thumbnail?: string;
  description?: string;
}

// Simulated catalog based on the user's data folder structure
export const ROBOT_CATALOG: RobotCatalogEntry[] = [
  {
    id: 'abb_irb2400',
    name: 'IRB 2400',
    manufacturer: 'ABB',
    // Assuming the user copied the folder structure as: data/abb_irb2400_support/urdf/irb2400.urdf
    urdfPath: 'data/abb_irb2400_support/urdf/irb2400.urdf', 
    description: 'A dedicated arc welding robot with 6 degrees of freedom.'
  }
];

// A simple default 6-DOF industrial robot arm URDF for demonstration
export const DEFAULT_URDF = `
<?xml version="1.0"?>
<robot name="Puma560_Pro">
  <material name="grey">
    <color rgba="0.2 0.2 0.2 1.0"/>
  </material>
  <material name="orange">
    <color rgba="1.0 0.4 0.0 1.0"/>
  </material>

  <link name="base_link" />

  <joint name="shoulder_pan" type="revolute">
    <parent link="base_link"/>
    <child link="shoulder_link"/>
    <origin xyz="0 0 0.0" rpy="0 0 0"/>
    <axis xyz="0 1 0"/>
    <limit lower="-3.14" upper="3.14" effort="100" velocity="1"/>
  </joint>

  <link name="shoulder_link" />

  <joint name="shoulder_lift" type="revolute">
    <parent link="shoulder_link"/>
    <child link="upper_arm_link"/>
    <origin xyz="0 0.5 0" rpy="0 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="-1.57" upper="1.57" effort="100" velocity="1"/>
  </joint>

  <link name="upper_arm_link" />

  <joint name="elbow_flex" type="revolute">
    <parent link="upper_arm_link"/>
    <child link="forearm_link"/>
    <origin xyz="0 1.0 0" rpy="0 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="-2.5" upper="2.5" effort="100" velocity="1"/>
  </joint>

  <link name="forearm_link" />

  <joint name="wrist_flex" type="revolute">
    <parent link="forearm_link"/>
    <child link="wrist_link"/>
    <origin xyz="0 0.8 0" rpy="0 0 0"/>
    <axis xyz="1 0 0"/>
    <limit lower="-1.57" upper="1.57" effort="100" velocity="1"/>
  </joint>

  <link name="wrist_link" />

  <joint name="wrist_roll" type="revolute">
    <parent link="wrist_link"/>
    <child link="end_effector"/>
    <origin xyz="0 0.4 0" rpy="0 0 0"/>
    <axis xyz="1 0 0"/>
    <limit lower="-3.14" upper="3.14" effort="100" velocity="1"/>
  </joint>

  <link name="end_effector" />

</robot>
`;
