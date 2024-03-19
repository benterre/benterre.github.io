const arXivPapers = document.getElementById('arXivPapers');
const arXivInput = document.getElementById('arXiv-input');
var url = 'https://export.arxiv.org/api/query?search_query='+ 'holographic entanglement entropy' +'+AND+cat:hep-th+OR+cat:math-ph&sortBy=lastUpdatedDate';
let timer;

arXivInput.value = "holographic entanglement entropy"

getArXiv(url).catch(error => {
  console.log(error);
});
setTimeout(function() {
  update_sec_position()
}, 3000)

arXivInput.addEventListener("input", function() {
  clearTimeout(timer);
  timer = setTimeout(function() {
    url = 'https://export.arxiv.org/api/query?search_query='+ arXivInput.value +'+AND+cat:hep-th+OR+cat:math-ph&sortBy=lastUpdatedDate';
    getArXiv(url).catch(error => {
      console.log(error);
    });
  setTimeout(function() {
    update_sec_position()
  }, 5000)
  }, 1000); // 3000 milliseconds = 3 seconds
});

//https://arxiv.org/category_taxonomy
//const categories = [{cat:'gr-qc', name:'General Relativity and Quantum Cosmology'},{cat:'hep-ex', name:'High Energy Physics - Experiment'},{cat:'hep-lat', name:'High Energy Physics - Lattice'},{cat:'hep-ph', name:'High Energy Physics - Phenomenology'},{cat:'hep-th', name:'High Energy Physics - Theory'},{cat:'math-ph', name:'Mathematical Physics'}];

async function getArXiv(url) {
  arXivPapers.innerHTML = "";
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const text = await response.text();
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "text/xml");
  var jsonText = xmlToJson(xmlDoc);
  
  jsonText['feed']['entry'].forEach((paper, i) => {
    //console.log(paper)
    //console.log(paper['title']['#text'])
    const authors_list = [paper['author']].flat();
    var authors = [];
    authors_list.forEach((x,i) => authors.push(x['name']['#text']));
    //console.log(paper['summary']['#text'])

    const canvas = document.createElement("canvas");
    showPDF('https://arxiv.org/pdf/' + paper['id']['#text'].split('/').at(-1) + '.pdf', canvas)
    const paper_div = document.createElement("a");
    paper_div.innerHTML = "<h4 style='height:6rem; overflow:hidden;'>" + paper['title']['#text'] + "</h4><p style='height:4rem; overflow:hidden;'>" + authors.join(", ") + "</p><em>" + paper['updated']['#text'] + "</em>"
    paper_div.appendChild(canvas);
    paper_div.style.width = "49%";
    paper_div.href = 'https://arxiv.org/pdf/' + paper['id']['#text'].split('/').at(-1) + '.pdf';
    //paper_div.style.borderRadius = "1rem";
    //paper_div.style.backgroundColor = "gray";
    //paper_div.addEventListener("click", (event) => {
    //  window.location = 'https://arxiv.org/pdf/' + paper['id']['#text'].split('/').at(-1) + '.pdf';
    //});
    paper_div.style.cursor = "pointer";
    arXivPapers.appendChild(paper_div);
  })
}

function xmlToJson(xml) {

  // Create the return object
  var obj = {};

  if (xml.nodeType == 1) { // element
    // do attributes
    if (xml.attributes.length > 0) {
    obj["@attributes"] = {};
      for (var j = 0; j < xml.attributes.length; j++) {
        var attribute = xml.attributes.item(j);
        obj["@attributes"][attribute.nodeName] = attribute.nodeValue;
      }
    }
  } else if (xml.nodeType == 3) { // text
    obj = xml.nodeValue;
  }

  // do children
  if (xml.hasChildNodes()) {
    for(var i = 0; i < xml.childNodes.length; i++) {
      var item = xml.childNodes.item(i);
      var nodeName = item.nodeName;
      if (typeof(obj[nodeName]) == "undefined") {
        obj[nodeName] = xmlToJson(item);
      } else {
        if (typeof(obj[nodeName].push) == "undefined") {
          var old = obj[nodeName];
          obj[nodeName] = [];
          obj[nodeName].push(old);
        }
        obj[nodeName].push(xmlToJson(item));
      }
    }
  }
  return obj;
};