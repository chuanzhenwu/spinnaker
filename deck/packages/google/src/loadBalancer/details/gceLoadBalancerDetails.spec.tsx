import type { ReactWrapper } from 'enzyme';
import { mount as enzymeMount, shallow } from 'enzyme';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { BehaviorSubject } from 'rxjs';

import { AccountService, CloudProviderRegistry, DeckRuntimeContext, ManagedMenuItem } from '@spinnaker/core';

import { GceLoadBalancerChoiceModal } from '../configure/choice/GceLoadBalancerChoiceModal';
import { GceLoadBalancerActions, useGceLoadBalancerDetails } from './gceLoadBalancerDetails';

describe('useGceLoadBalancerDetails', () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  let wrapper: ReactWrapper | undefined;
  let runtimeServices: any;

  const RuntimeWrapper = ({ children }: React.PropsWithChildren<{}>) => (
    <DeckRuntimeContext.Provider value={{ services: runtimeServices } as any}>{children}</DeckRuntimeContext.Provider>
  );
  const mount = (component: React.ReactElement) => enzymeMount(component, { wrappingComponent: RuntimeWrapper });

  beforeEach(() => {
    runtimeServices = {};
  });

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount();
      wrapper = undefined;
    }
  });

  it('does not refetch details when re-rendered with inline autoClose and loadBalancerParams', async () => {
    const sourceLb = {
      account: 'waze-stg',
      listeners: [{ name: 'victim-fr' }],
      loadBalancerType: 'INTERNAL_MANAGED',
      name: 'victim-stg-stg1-td',
      provider: 'gce',
      region: 'global',
    } as any;
    const status$ = new BehaviorSubject({
      data: [sourceLb],
      lastRefresh: 1,
      loaded: true,
      status: 'FETCHED',
    });
    const app = {
      getDataSource: jasmine.createSpy('getDataSource').and.returnValue({
        refresh: jasmine.createSpy('refresh'),
        status$,
      }),
    } as any;
    const getLoadBalancerDetails = jasmine
      .createSpy('getLoadBalancerDetails')
      .and.returnValue(Promise.resolve([{ dnsname: '10.0.0.1', listenerDescriptions: [] }]));
    runtimeServices.loadBalancerReader = { getLoadBalancerDetails };
    spyOn(AccountService, 'getAccountDetails').and.returnValue(Promise.resolve({ project: 'waze-stg' }) as any);

    function TestComponent() {
      useGceLoadBalancerDetails({
        app,
        autoClose: () => undefined,
        loadBalancerParams: {
          accountId: 'waze-stg',
          name: 'victim-stg-stg1-td',
          provider: 'gce',
          region: 'global',
        },
      });
      return null;
    }

    await act(async () => {
      wrapper = mount(<TestComponent />);
      await flush();
    });
    wrapper.update();

    await act(async () => {
      await flush();
    });
    wrapper.update();

    expect(getLoadBalancerDetails).toHaveBeenCalledTimes(1);
    expect((sourceLb as any).elb).toBeUndefined();
  });
});

describe('GceLoadBalancerActions', () => {
  const app = { name: 'fnord' } as any;
  const loadBalancer = {
    account: 'account-a',
    instances: [],
    loadBalancerType: 'INTERNAL_MANAGED',
    name: 'fnord-main',
    region: 'europe-west1',
  } as any;

  it('hides write actions when the Google provider is disabled', () => {
    spyOn(CloudProviderRegistry, 'isDisabled').and.returnValue(true);

    const wrapper = shallow(<GceLoadBalancerActions app={app} loadBalancer={loadBalancer} />);

    expect(wrapper.isEmptyRender()).toBe(true);
  });

  it('opens the current load balancer in edit mode through managed-resource gating', () => {
    spyOn(CloudProviderRegistry, 'isDisabled').and.returnValue(false);
    const show = spyOn(GceLoadBalancerChoiceModal, 'show').and.returnValue(Promise.resolve() as any);

    const wrapper = shallow(<GceLoadBalancerActions app={app} loadBalancer={loadBalancer} />);
    const edit = wrapper.find(ManagedMenuItem).filterWhere((item) => item.prop('children') === 'Edit Load Balancer');

    expect(edit.prop('application')).toBe(app);
    expect(edit.prop('resource')).toBe(loadBalancer);
    edit.prop('onClick')();
    expect(show).toHaveBeenCalledOnceWith({
      app,
      application: app,
      forPipelineConfig: false,
      isNew: false,
      loadBalancer,
      mode: 'edit',
    } as any);
  });

  it('keeps delete behind managed-resource gating and disables it while instances are attached', () => {
    spyOn(CloudProviderRegistry, 'isDisabled').and.returnValue(false);

    const editable = shallow(<GceLoadBalancerActions app={app} loadBalancer={loadBalancer} />);
    const managedDelete = editable
      .find(ManagedMenuItem)
      .filterWhere((item) => item.prop('children') === 'Delete Load Balancer');
    expect(managedDelete.prop('application')).toBe(app);
    expect(managedDelete.prop('resource')).toBe(loadBalancer);

    const attached = shallow(
      <GceLoadBalancerActions app={app} loadBalancer={{ ...loadBalancer, instances: [{ name: 'instance-a' }] }} />,
    );
    expect(
      attached.find(ManagedMenuItem).filterWhere((item) => item.prop('children') === 'Delete Load Balancer'),
    ).toHaveSize(0);
    expect(attached.find('li.disabled').text()).toContain('Delete Load Balancer');
  });
});
