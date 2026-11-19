import { mount as enzymeMount, shallow } from 'enzyme';
import React from 'react';

import { CloudProviderRegistry, CollapsibleSection, DeckRuntimeContext, ManagedMenuItem } from '@spinnaker/core';

import { GceAutoscalingPolicyWriter } from '../../autoscalingPolicy';
import { GceCustomMetadataList, GceLabelsList, GceTagsList } from '../../common/GceResourceMetadata';
import { registerGoogleProvider } from '../../gce.module';
import { GceCloneServerGroupModal } from '../configure/wizard/GceCloneServerGroupModal';
import { GceAutoHealingPolicyDetails } from './autoHealingPolicy';
import { GceAutoscalingPolicyDetails } from './autoscalingPolicy';
import {
  GceServerGroupActions,
  GceServerGroupCustomMetadataSection,
  GceServerGroupLabelsSection,
  GceServerGroupLaunchConfigSection,
  GceServerGroupTagsSection,
  gceServerGroupDetailsSections,
} from './gceServerGroupDetails';
import { GceInstanceFlexibilityPolicyDetails } from './GceInstanceFlexibilityPolicyDetails';
import { GceServerGroupDiskDescriptions } from './GceServerGroupDiskDescriptions';
import { GceResizeServerGroupModal } from './resize/GceResizeServerGroupModal';
import { GceRollbackServerGroupModal } from './rollback/GceRollbackServerGroupModal';

describe('GCE server group details integration', () => {
  let runtimeServices: any;
  const RuntimeWrapper = ({ children }: React.PropsWithChildren<{}>) => (
    <DeckRuntimeContext.Provider value={{ services: runtimeServices } as any}>{children}</DeckRuntimeContext.Provider>
  );
  const mount = (component: React.ReactElement) => enzymeMount(component, { wrappingComponent: RuntimeWrapper });

  beforeEach(() => {
    runtimeServices = {
      serverGroupCommandBuilder: {},
      serverGroupWriter: {},
    };
  });
  const serverGroup = {
    account: 'prod',
    app: 'fnord',
    autoscalingMessages: ['autoscaler active'],
    autoscalingPolicy: { maxNumReplicas: 5, minNumReplicas: 1 },
    autoHealingPolicy: { healthCheck: 'fnord-health-check', initialDelaySec: 300 },
    cluster: 'fnord-main',
    isDisabled: false,
    name: 'fnord-main-v004',
    region: 'us-central1',
  } as any;
  const eligibleRollbackCandidate = {
    ...serverGroup,
    autoscalingPolicy: undefined,
    autoHealingPolicy: undefined,
    isDisabled: true,
    name: 'fnord-main-v003',
  };
  const app = {
    attributes: {},
    name: 'fnord',
    serverGroups: {
      data: [
        eligibleRollbackCandidate,
        { ...eligibleRollbackCandidate, app: 'other', name: 'other-main-v003' },
        { ...eligibleRollbackCandidate, isDisabled: false, name: 'fnord-main-v002' },
      ],
      refresh: jasmine.createSpy('refresh'),
    },
  } as any;

  const managedAction = (wrapper: any, label: string) =>
    wrapper.find(ManagedMenuItem).filterWhere((item: any) => item.prop('children') === label);

  const linkAction = (wrapper: any, label: string) =>
    wrapper.find('a').filterWhere((link: any) => link.text() === label);

  it('registers autoscaling and auto-healing sections backed by the completed details components', () => {
    registerGoogleProvider();

    expect(CloudProviderRegistry.getValue('gce', 'serverGroup.detailsSections')).toEqual(gceServerGroupDetailsSections);

    const renderedSections = gceServerGroupDetailsSections.map((Section) =>
      shallow(<Section app={app} serverGroup={serverGroup} />),
    );
    const autoscaling = renderedSections.find(
      (section) => section.find(CollapsibleSection).prop('heading') === 'Autoscaling',
    );
    const autoHealing = renderedSections.find(
      (section) => section.find(CollapsibleSection).prop('heading') === 'Auto-healing',
    );

    expect(autoscaling.find(GceAutoscalingPolicyDetails).props()).toEqual(
      jasmine.objectContaining({ application: app, policy: serverGroup.autoscalingPolicy, serverGroup }),
    );
    expect(autoHealing.find(GceAutoHealingPolicyDetails).props()).toEqual(
      jasmine.objectContaining({ application: app, policy: serverGroup.autoHealingPolicy, serverGroup }),
    );
  });

  it('keeps policy summaries read-only when GCE ad-hoc infrastructure writes are disabled', () => {
    spyOn(CloudProviderRegistry, 'isDisabled').and.returnValue(true);
    const renderedSections = gceServerGroupDetailsSections.map((Section) =>
      shallow(<Section app={app} serverGroup={serverGroup} />),
    );
    const autoscalingSection = renderedSections.find(
      (section) => section.find(CollapsibleSection).prop('heading') === 'Autoscaling',
    );
    const autoHealingSection = renderedSections.find(
      (section) => section.find(CollapsibleSection).prop('heading') === 'Auto-healing',
    );
    const autoscaling = shallow(autoscalingSection.find(GceAutoscalingPolicyDetails).getElement());
    const autoHealing = shallow(autoHealingSection.find(GceAutoHealingPolicyDetails).getElement());

    expect(autoscaling.text()).toContain('Min # VMs');
    expect(autoscaling.find('[data-testid="edit-autoscaling-policy"]').length).toBe(0);
    expect(autoscaling.find('[data-testid="delete-autoscaling-policy"]').length).toBe(0);
    expect(autoHealing.text()).toContain('fnord-health-check');
    expect(autoHealing.find('[data-testid="edit-auto-healing-policy"]').length).toBe(0);
    expect(autoHealing.find('[data-testid="delete-auto-healing-policy"]').length).toBe(0);
  });

  it('does not offer policy creation when GCE ad-hoc infrastructure writes are disabled', () => {
    spyOn(CloudProviderRegistry, 'isDisabled').and.returnValue(true);
    const serverGroupWithoutPolicies = {
      ...serverGroup,
      autoscalingPolicy: undefined,
      autoHealingPolicy: undefined,
    };
    const renderedSections = gceServerGroupDetailsSections.map((Section) =>
      shallow(<Section app={app} serverGroup={serverGroupWithoutPolicies} />),
    );
    const autoscalingSection = renderedSections.find(
      (section) => section.find(CollapsibleSection).prop('heading') === 'Autoscaling',
    );
    const autoHealingSection = renderedSections.find(
      (section) => section.find(CollapsibleSection).prop('heading') === 'Auto-healing',
    );
    const autoscaling = shallow(autoscalingSection.find(GceAutoscalingPolicyDetails).getElement());
    const autoHealing = shallow(autoHealingSection.find(GceAutoHealingPolicyDetails).getElement());

    expect(autoscaling.find('[data-testid="add-autoscaling-policy"]').length).toBe(0);
    expect(autoHealing.find('[data-testid="add-auto-healing-policy"]').length).toBe(0);
  });

  it('renders target shape and instance flexibility in the launch configuration without nesting definition lists', () => {
    const instanceFlexibilityPolicy = {
      instanceSelections: {
        preferred: { rank: 1, machineTypes: ['n2-standard-8'] },
      },
    };
    const wrapper = shallow(
      <GceServerGroupLaunchConfigSection
        app={app}
        serverGroup={{
          ...serverGroup,
          distributionPolicy: { targetShape: 'BALANCED' },
          instanceFlexibilityPolicy,
        }}
      />,
    );

    expect(wrapper.find('dt').filterWhere((term) => term.text() === 'Target shape').length).toBe(1);
    expect(wrapper.find('dd').filterWhere((definition) => definition.text() === 'BALANCED').length).toBe(1);
    expect(wrapper.find(GceInstanceFlexibilityPolicyDetails).prop('instanceFlexibilityPolicy')).toBe(
      instanceFlexibilityPolicy,
    );
    expect(wrapper.find('dl dl').length).toBe(0);
  });

  it('renders shielded settings with stable, legacy, then top-level field precedence', () => {
    const wrapper = shallow(
      <GceServerGroupLaunchConfigSection
        app={app}
        serverGroup={{
          ...serverGroup,
          shieldedInstanceConfig: { enableSecureBoot: false },
          shieldedVmConfig: { enableSecureBoot: true, enableVtpm: false },
          enableVtpm: true,
          enableIntegrityMonitoring: false,
        }}
      />,
    );
    const definitions = (label: string) => {
      const index = wrapper
        .find('dt')
        .map((candidate) => candidate.text())
        .indexOf(label);
      return index < 0 ? undefined : wrapper.find('dd').at(index).text();
    };

    expect(definitions('Secure Boot')).toBe('false');
    expect(definitions('vTPM')).toBe('false');
    expect(definitions('Integrity Monitoring')).toBe('false');
  });

  it('restores image, instance type, and the legacy launch configuration fields', () => {
    const launchConfigServerGroup = {
      ...serverGroup,
      network: 'default',
      subnet: 'default-subnet',
      launchConfig: {
        imageId: 'fnord-image-v1',
        instanceType: 'custom-2-4096',
        launchConfigurationName: 'fnord-main-v004-template',
        minCpuPlatform: 'Intel Skylake',
        instanceTemplate: {
          name: 'fnord-main-v004-template',
          properties: {
            canIpForward: true,
            disks: [{ boot: true, deviceName: 'boot', initializeParams: { diskSizeGb: 10, diskType: 'pd-ssd' } }],
            metadata: { items: [{ key: 'startup-script', value: 'echo hello' }] },
            networkInterfaces: [{ accessConfigs: [{ name: 'External NAT' }] }],
            serviceAccounts: [
              {
                email: 'fnord@test.iam.gserviceaccount.com',
                scopes: ['https://www.googleapis.com/auth/cloud-platform'],
              },
            ],
          },
        },
      },
    };
    const wrapper = shallow(<GceServerGroupLaunchConfigSection app={app} serverGroup={launchConfigServerGroup} />);
    const definition = (label: string) => {
      const index = wrapper
        .find('dt')
        .map((candidate) => candidate.text().trim())
        .indexOf(label);
      return index < 0 ? undefined : wrapper.find('dd').at(index).text().trim();
    };

    expect(definition('Image')).toBe('fnord-image-v1');
    expect(definition('Instance Type')).toBe('N1 2 vCPU / 4 GB RAM');
    expect(definition('Minimum CPU Platform')).toBe('Intel Skylake');
    expect(definition('Service Account')).toBe('fnord@test.iam.gserviceaccount.com');
    expect(definition('Auth Scopes')).toContain('cloud-platform');
    expect(definition('Network')).toBe('default');
    expect(definition('Subnet')).toBe('default-subnet');
    expect(definition('Associate Public IP Address')).toBe('true');
    expect(definition('Can IP Forward')).toBe('true');
    expect(wrapper.find('dt').filterWhere((term) => term.text() === 'Name').length).toBe(0);
    expect(wrapper.find(GceServerGroupDiskDescriptions).props()).toEqual(
      jasmine.objectContaining({ application: app, serverGroup: launchConfigServerGroup }),
    );

    expect(wrapper.find('pre').length).toBe(0);
    linkAction(wrapper, 'Show Startup Script').simulate('click');
    expect(wrapper.find('pre').text()).toBe('echo hello');
    expect(linkAction(wrapper, 'Hide Startup Script').length).toBe(1);
  });

  it('falls back to defaults when launch configuration fields are absent', () => {
    const wrapper = shallow(<GceServerGroupLaunchConfigSection app={app} serverGroup={serverGroup} />);
    const definition = (label: string) => {
      const index = wrapper
        .find('dt')
        .map((candidate) => candidate.text().trim())
        .indexOf(label);
      return index < 0 ? undefined : wrapper.find('dd').at(index).text().trim();
    };

    expect(definition('Image')).toBe('-');
    expect(definition('Instance Type')).toBe('-');
    expect(definition('Minimum CPU Platform')).toBe('(Automatic)');
    expect(definition('Associate Public IP Address')).toBe('false');
    expect(definition('Startup Script')).toBe('[none]');
    expect(definition('Service Account')).toBeUndefined();
    expect(definition('Auth Scopes')).toBeUndefined();
  });

  it('renders boot and additional disk descriptions from the instance template', () => {
    const wrapper = enzymeMount(
      <dl>
        <GceServerGroupDiskDescriptions
          application={app}
          serverGroup={
            {
              ...serverGroup,
              launchConfig: {
                instanceTemplate: {
                  properties: {
                    disks: [
                      {
                        boot: true,
                        deviceName: 'boot',
                        initializeParams: {
                          diskSizeGb: 10,
                          diskType: 'pd-ssd',
                          sourceImage: 'https://compute.googleapis.com/projects/p/global/images/fnord-image-v1',
                        },
                      },
                      { boot: false, deviceName: 'data', initializeParams: { diskSizeGb: 375, diskType: 'local-ssd' } },
                    ],
                  },
                },
              },
            } as any
          }
        />
      </dl>,
    );

    expect(wrapper.find('dt').map((term) => term.text())).toEqual(['Boot Disk', 'Disk']);
    expect(wrapper.find('dd').map((definition) => definition.text())).toEqual([
      'Persistent SSD: 10GB',
      'Image: fnord-image-v1',
      'Local SSD: 375GB',
    ]);
    wrapper.unmount();
  });

  it('registers custom metadata, tags, and labels sections', () => {
    const sectionHeadings = gceServerGroupDetailsSections.map(
      (Section) =>
        shallow(<Section app={app} serverGroup={serverGroup} />)
          .find(CollapsibleSection)
          .prop('heading') as string,
    );

    expect(sectionHeadings).toEqual(jasmine.arrayContaining(['Custom Metadata', 'Tags', 'Labels']));
  });

  it('renders truncated custom metadata from the instance template', () => {
    const longValue = 'x'.repeat(100);
    const section = shallow(
      <GceServerGroupCustomMetadataSection
        app={app}
        serverGroup={{
          ...serverGroup,
          launchConfig: {
            instanceTemplate: {
              properties: {
                metadata: {
                  items: [
                    { key: 'load-balancer-names', value: 'fnord-lb' },
                    { key: 'long-value', value: longValue },
                  ],
                },
              },
            },
          },
        }}
      />,
    );
    const metadata = shallow(section.find(GceCustomMetadataList).getElement());

    expect(section.find(GceCustomMetadataList).prop('helpKeyPrefix')).toBe('gce.serverGroup.customMetadata');
    expect(metadata.find('dt').map((term) => term.text().trim())).toEqual([
      jasmine.stringMatching(/^load-balancer-names/),
      jasmine.stringMatching(/^long-value/),
    ]);
    expect(metadata.find('dd').map((definition) => definition.text())).toEqual(['fnord-lb', `${'x'.repeat(90)}...`]);
  });

  it('renders network tags with firewall help and instance template labels', () => {
    const appWithFirewalls = {
      ...app,
      securityGroups: {
        data: [
          { accountName: 'prod', name: 'allow-http', targetTags: ['http-server'] },
          { accountName: 'other', name: 'other-account-http', targetTags: ['http-server'] },
        ],
      },
    };
    const sgWithTagsAndLabels = {
      ...serverGroup,
      instanceTemplateLabels: { team: 'fnord' },
      launchConfig: { instanceTemplate: { properties: { tags: { items: ['http-server', 'untagged'] } } } },
    };
    const tagsSection = shallow(<GceServerGroupTagsSection app={appWithFirewalls} serverGroup={sgWithTagsAndLabels} />);
    const labelsSection = shallow(<GceServerGroupLabelsSection app={app} serverGroup={sgWithTagsAndLabels} />);

    expect(tagsSection.find(GceTagsList).prop('tags')).toEqual(['http-server', 'untagged']);
    expect(tagsSection.find(GceTagsList).prop('helpMap')).toEqual({
      'http-server': 'This tag associates this resource with security group <em>allow-http</em>.',
    });
    expect(shallow(tagsSection.find(GceTagsList).getElement()).find('dd').length).toBe(2);
    const labels = shallow(labelsSection.find(GceLabelsList).getElement());
    expect(labels.find('dt').text()).toMatch(/^team/);
    expect(labels.find('dd').text()).toBe('fnord');
  });

  it('shows empty-state messages when metadata, tags, and labels are missing', () => {
    const render = (Section: any, List: any) =>
      shallow(
        shallow(<Section app={app} serverGroup={serverGroup} />)
          .find(List)
          .getElement(),
      ).text();

    expect(render(GceServerGroupCustomMetadataSection, GceCustomMetadataList)).toBe(
      'No custom metadata associated with this server group',
    );
    expect(render(GceServerGroupTagsSection, GceTagsList)).toBe('No tags associated with this server group');
    expect(render(GceServerGroupLabelsSection, GceLabelsList)).toBe('No labels associated with this server group');
  });

  it('adds rollback and resize without changing existing enabled action visibility', () => {
    const wrapper = mount(<GceServerGroupActions app={app} serverGroup={serverGroup} />);

    expect(managedAction(wrapper, 'Rollback').length).toBe(1);
    expect(managedAction(wrapper, 'Resize').length).toBe(1);
    expect(linkAction(wrapper, 'Clone').length).toBe(1);
    expect(linkAction(wrapper, 'Disable').length).toBe(1);
    expect(linkAction(wrapper, 'Enable').length).toBe(0);
    expect(linkAction(wrapper, 'Destroy').length).toBe(1);
  });

  it('opens clone with the command builder and runtime services from Deck context', async () => {
    const command = { application: serverGroup.app, stack: 'main' };
    runtimeServices.serverGroupCommandBuilder = {
      buildServerGroupCommandFromExisting: jasmine
        .createSpy('buildServerGroupCommandFromExisting')
        .and.resolveTo(command),
    };
    const show = spyOn(GceCloneServerGroupModal, 'show').and.resolveTo({} as any);
    const wrapper = mount(<GceServerGroupActions app={app} serverGroup={serverGroup} />);

    linkAction(wrapper, 'Clone').simulate('click');
    await Promise.resolve();

    expect(runtimeServices.serverGroupCommandBuilder.buildServerGroupCommandFromExisting).toHaveBeenCalledWith(
      app,
      serverGroup,
    );
    expect(show).toHaveBeenCalledWith(
      { application: app, command, title: `Clone ${serverGroup.name}` },
      runtimeServices,
    );
  });

  it('keeps rollback hidden for a disabled server group without changing existing disabled action visibility', () => {
    const wrapper = mount(<GceServerGroupActions app={app} serverGroup={{ ...serverGroup, isDisabled: true }} />);

    expect(managedAction(wrapper, 'Rollback').length).toBe(0);
    expect(managedAction(wrapper, 'Resize').length).toBe(1);
    expect(linkAction(wrapper, 'Disable').length).toBe(0);
    expect(linkAction(wrapper, 'Enable').length).toBe(1);
  });

  it('opens rollback with filtered candidates and the existing server group writer', () => {
    const show = spyOn(GceRollbackServerGroupModal, 'show').and.returnValue(Promise.resolve({} as any));
    const wrapper = mount(<GceServerGroupActions app={app} serverGroup={serverGroup} />);

    managedAction(wrapper, 'Rollback').prop('onClick')();

    expect(show).toHaveBeenCalledOnceWith({
      application: app,
      serverGroup,
      serverGroups: [eligibleRollbackCandidate],
      serverGroupWriter: runtimeServices.serverGroupWriter,
    });
  });

  it('keeps rollback available when there are no candidates and delegates empty handling to the modal', () => {
    const appWithoutCandidates = { ...app, serverGroups: { ...app.serverGroups, data: [] } };
    const show = spyOn(GceRollbackServerGroupModal, 'show').and.returnValue(Promise.resolve({} as any));
    const wrapper = mount(<GceServerGroupActions app={appWithoutCandidates} serverGroup={serverGroup} />);

    expect(managedAction(wrapper, 'Rollback').length).toBe(1);
    managedAction(wrapper, 'Rollback').prop('onClick')();

    expect(show).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({ application: appWithoutCandidates, serverGroup, serverGroups: [] }),
    );
  });

  it('opens resize with the completed writers', () => {
    const show = spyOn(GceResizeServerGroupModal, 'show').and.returnValue(Promise.resolve());
    const wrapper = mount(<GceServerGroupActions app={app} serverGroup={serverGroup} />);

    managedAction(wrapper, 'Resize').prop('onClick')();

    expect(show).toHaveBeenCalledOnceWith({
      application: app,
      autoscalingPolicyWriter: GceAutoscalingPolicyWriter,
      serverGroup,
      serverGroupWriter: runtimeServices.serverGroupWriter,
    });
  });

  it('protects rollback and resize with the managed-resource interstitial', () => {
    const wrapper = mount(<GceServerGroupActions app={app} serverGroup={{ ...serverGroup, isManaged: true }} />);

    ['Rollback', 'Resize'].forEach((label) => {
      expect(managedAction(wrapper, label).props()).toEqual(
        jasmine.objectContaining({ application: app, resource: jasmine.objectContaining({ isManaged: true }) }),
      );
    });
  });

  it('hides server group actions when GCE ad-hoc infrastructure writes are disabled', () => {
    spyOn(CloudProviderRegistry, 'isDisabled').and.returnValue(true);

    const wrapper = mount(<GceServerGroupActions app={app} serverGroup={serverGroup} />);

    expect(wrapper.isEmptyRender()).toBe(true);
  });
});
