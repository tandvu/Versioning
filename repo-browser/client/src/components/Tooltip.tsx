import React from 'react';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';

export const Tooltip: React.FC<{ content: React.ReactNode; children: React.ReactNode; forceShow?: boolean }> = ({ content, children, forceShow }) => (
  <Tippy
    content={<span style={{ whiteSpace: 'pre-line', fontSize: '1em' }}>{content}</span>}
    placement="top"
    maxWidth={320}
    disabled={false}
    visible={forceShow ? true : undefined}
  >
    <span>{children}</span>
  </Tippy>
);
