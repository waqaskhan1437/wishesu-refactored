;(function(){
  function readSeoFields(form){
    return{meta:{
      seo_title:(form.seo_title.value||'').trim(),
      seo_description:(form.seo_description.value||'').trim(),
      seo_keywords:(form.seo_keywords.value||'').trim(),
      seo_canonical:(form.seo_canonical.value||'').trim()
    }};
  }
  function populateSeoForm(form,product){
    if(!product)return;
    if(product.seo_title)form.seo_title.value=product.seo_title;
    if(product.seo_description)form.seo_description.value=product.seo_description;
    if(product.seo_keywords)form.seo_keywords.value=product.seo_keywords;
    if(product.seo_canonical)form.seo_canonical.value=product.seo_canonical;
  }
  window.readSeoFields=readSeoFields;
  window.populateSeoForm=populateSeoForm;
})();