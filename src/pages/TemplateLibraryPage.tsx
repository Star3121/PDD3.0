import React from 'react';
import Layout from '../components/Layout';
import TemplateLibrary from '../components/TemplateLibrary';

const TemplateLibraryPage: React.FC = () => {
  return (
    <Layout title="模板库">
      <TemplateLibrary onTemplateSelect={() => { /* 独立页面无需选择回调 */ }} />
    </Layout>
  );
};

export default TemplateLibraryPage;