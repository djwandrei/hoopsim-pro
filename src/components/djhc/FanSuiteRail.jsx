import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { WORKBENCHES, findStudioTool } from '@/components/studio/workbenches';
import { Image } from '@/components/ui/image';
export default function FanSuiteRail() {
  const { pathname } = useLocation();
  const activePath = findStudioTool(pathname)?.workbench.path;
  return <nav className="fan-suite-nav" aria-label="Studio workbench navigation"><div className="container fan-suite-nav__scroll">{WORKBENCHES.map(workbench => {
    const Icon = workbench.icon;
    return <Link key={workbench.path} to={workbench.path} className="fan-suite-nav__link" aria-current={activePath === workbench.path ? 'page' : undefined}>
      {workbench.useEmblemInRail && workbench.emblem
        ? <Image src={workbench.emblem} alt="" fittingType="fit" className="h-[30px] w-[30px] shrink-0 object-contain" />
        : Icon && <Icon aria-hidden="true" className="h-[30px] w-[30px] shrink-0" />}
      <span>{workbench.title}</span>
    </Link>;
  })}</div></nav>;
}
