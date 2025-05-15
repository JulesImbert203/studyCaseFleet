import './App.css' ;
import React, { useEffect, useState, useRef } from 'react' ;


const MoviePopup = ({ movie, setSelectedMovie, imageBaseUrl, langToCountry, renderStars, useDonwloader, setUseDownloader }) => {
  if (!movie) return null;
  return (
    <div className="popup-overlay" onClick={() => setSelectedMovie(null)}>
      <div className="popup-content" onClick={e => e.stopPropagation()}>
        <img
          className="detail-poster"
          src={`${imageBaseUrl}${movie.poster_path}`}
          alt={movie.title}
        />
        <div className="popup-details">
          <h2>{movie.title}</h2>
          {!useDonwloader ?
            <div>
              <div className="titre-lang">
                <img
                  className="lang-icon"
                  src={`https://flagcdn.com/w40/${langToCountry[movie.original_language]}.png`}
                  alt={movie.original_language}
                  title={movie.original_language}
                />
                <div>
                  <p>{movie.original_title} ({movie.release_date.split('-')[0]})</p>
                </div>
              </div>
              <div className="stars">
                {renderStars(movie.vote_average)}
                <span className="vote-count">({movie.vote_count} votes)</span>
              </div>
              <p><strong>Synopsis :</strong> {movie.overview}</p>
              <div className="play-button">
                <a href={`https://vidsrc.cc/v2/embed/movie/${movie.id}`} target="_blank" rel="noopener noreferrer">
                  <img alt="play" className="icon-play" src="assets/play.svg" />
                </a>
                <img alt="donwload video" className="icon-play" src="assets/download.svg" onClick={() => setUseDownloader(true)}/>
              </div>
            </div> :
            <div className='downloader'>
              <p>Menu de téléchargement</p>
            </div>
          }     
        </div>
      </div>
    </div>
  );
};



function App() {

  const authorization = 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJhYTA1OGUwZjY4ODE1YjViMzQ0NDRhZGJmY2I5OTViNCIsIm5iZiI6MTc0NDk5NzQ4MC41NTUsInN1YiI6IjY4MDI4YzY4ZDMxN2JlNWU1Yzk5MzkyOSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.VewGujN9VmNCRP7-xO8gIrgQraOJtETNb8aalP2T2iA' ;
  
  const [currentMoviesData, setCurrentMoviesData] = useState({ results: [] }) ;
  const [currentPage, setCurrentPage] = useState(1) ;
  const [selectedMovie, setSelectedMovie] = useState(null) ;
  const [keywords, setKeywords] = useState('') ;
  const isSearchDisabled = keywords.trim() === '' ;
  const [currentSrc, setCurrentSrc] = useState('trending') ;
  const [currentMaxPage, setCurrentMaxPage] = useState(null) ;
  const [isLoading, setIsLoading] = useState(true) ;
  const [useDonwloader, setUseDownloader] = useState(false) ;



  async function get_trending_movies(page) {
    const url_trending = `https://api.themoviedb.org/3/trending/movie/day?language=en-US&page=${page}` ;
    const options = {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: authorization
    }};
    try {
      setIsLoading(true);
      const res = await fetch(url_trending, options) ;
      const data = await res.json();
      setCurrentMoviesData(data) ;
      setCurrentMaxPage(data.total_pages) ;
      setCurrentPage(page) ;
      setCurrentSrc('trending') ;
      setIsLoading(false);
    } catch (e) {
      console.error('Erreur lors du fetch TMDB:', e) ;
    }
  } ;

  const getMoviesByKeywords = async (keywords, page) => {
    const url = `https://api.themoviedb.org/3/search/movie?&query=${keywords}&page=${page}&sort_by=popularity.desc`;
    const options = {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: authorization
    }} ;
    try {
      setIsLoading(true) ;
      const res = await fetch(url, options) ;
      const data = await res.json() ;
      setCurrentMoviesData(data) ;
      setCurrentSrc("keywords") ;
      setCurrentMaxPage(data.total_pages) ;
      setCurrentPage(page) ;
      setIsLoading(false) ;
    } catch (e) {
      console.error("Erreur lors de la récupération des films : ", e) ;
    }
  } ;

  
  const langToCountry = { en: "us", fr: "fr", es: "es", de: "de", it: "it", pt: "pt", nl: "nl", ru: "ru", ja: "jp", zh: "cn", ko: "kr", ar: "sa", hi: "in", tr: "tr", pl: "pl", sv: "se", no: "no", da: "dk", fi: "fi", cs: "cz", el: "gr", he: "il", th: "th", id: "id", vi: "vn" };

  const changePage = (src, new_page) => {
    if (src === 'trending') {
      if (new_page <= currentMaxPage && new_page > 0) {
        get_trending_movies(new_page) ;
      }
    } else if (src === 'keywords') {
      if (new_page <= currentMaxPage && new_page > 0) {
        getMoviesByKeywords(keywords, new_page) ;
      }
    } 
  } ;

  useEffect(() => {
    get_trending_movies(1);
  }, []);
  
  const renderStars = (voteAverage) => {
    const stars = [];
    const rating = voteAverage / 2; // note sur 5
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.25 && rating % 1 < 0.75;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    for (let i = 0; i < fullStars; i++) {
      stars.push(<img key={`full-${i}`} src="assets/full_star.svg" alt="full" className="star" />);
    }
    if (hasHalfStar) {
      stars.push(<img key="half" src="assets/half_star.svg" alt="half" className="star" />);
    }
    for (let i = 0; i < emptyStars; i++) {
      stars.push(<img key={`empty-${i}`} src="assets/empty_star.svg" alt="empty" className="star" />);
    }
    return stars;
  };
  
  
  
  const imageBaseUrl = 'https://image.tmdb.org/t/p/w500';

  return (
    <div className="App">

      <header className="header">
        <div className="titre" onClick={() => { window.location.reload() ; }}>
          <img 
          src="assets/movie.svg" 
          alt="Accueil"
          className='home-icon'
          />
          <div><h1>Films</h1></div>
        </div>
        
        <div className='search-bar-container'>
        <img 
            src='assets/home.svg' 
            alt='Accueil' 
            className='search-icon'
            onClick={() => { window.location.reload() ; }}
            style={{ cursor: 'pointer' }}
          />
          <input
            type='text'
            placeholder='Rechercher un film...'
            value={keywords}
            className='search-bar'
            onChange={(e) => setKeywords(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isSearchDisabled) {
                getMoviesByKeywords(keywords, 1);
              }
            }}
          />
          <img 
            src='assets/search.svg' 
            alt='Rechercher' 
            className='search-icon'
            style={{ cursor: isSearchDisabled ? 'not-allowed' : 'pointer' }}
            onClick={() => {if (!isSearchDisabled) {getMoviesByKeywords(keywords, 1);}}
            }
          />
        </div>
      </header>

      {
        isLoading ? 
        <div className='loading-container'>
          <img className="loading-icon" src='assets/loading.svg' alt="loading" />
          <p>Chargement en cours</p>
        </div>
        :
        Array.isArray(currentMoviesData?.results) && currentMoviesData.results.length === 0 ? (
          <div className='no-result-container'>
            <img className="no-result-icon" src='assets/no_result.svg' alt="no result" />
            <p>Aucun résultat</p>
          </div>
        ) : (
          <div className='content'>
            <div className='title-search-container'>
              <div>
                {currentSrc === "trending" && <p className='title-search'>Films populaires en ce moment</p>}
                {currentSrc === "keywords" && <p className='title-search'>Résultats de la recherche "{keywords}"</p>}
              </div>
            </div>            
            <div className='grid'>
              {currentMoviesData.results.map(movie => (
                <div className='movie' key={movie.id}>
                  <img
                    src={`${imageBaseUrl}${movie.poster_path}`}
                    alt=""
                    className='poster'
                    onClick={() => setSelectedMovie(movie)}
                    onError={(e) => {
                      e.target.onerror = null ; 
                      e.target.src = 'assets/default_poster.jpg' ;
                    }}
                  />
                  <h2 className='movie-title'>{movie.title}</h2>
                </div>
              ))}
              {selectedMovie && 
                <MoviePopup
                  movie={selectedMovie}
                  setSelectedMovie={setSelectedMovie}
                  imageBaseUrl={imageBaseUrl}
                  langToCountry={langToCountry}
                  renderStars={renderStars}
                  useDonwloader={useDonwloader}
                  setUseDownloader={setUseDownloader}
                />
              }
            </div>

            <div className='menu'>

              <img 
                src='assets/home.svg' 
                alt='Accueil' 
                className='search-icon-bottom'
                onClick={() => { window.location.reload() ; }}
                style={{ cursor: 'pointer' }}
              />

              {currentMaxPage > 1 && (
                <div className='menu-nav'>
                  {currentPage > 1 && (
                    <img
                      alt="<-"
                      className="arrow"
                      src='assets/back.svg'
                      onClick={() => changePage(currentSrc, currentPage - 1)}
                    />
                  )}

                  <input
                    type="number"
                    min="1"
                    max={currentMaxPage}
                    defaultValue={currentPage}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const value = parseInt(e.target.value) ;
                        if (!isNaN(value) && value >= 1 && value <= currentMaxPage) {
                          changePage(currentSrc, value) ;
                        } 
                      }
                    }}
                    className="page-input"
                  />

                  <span className='menu-max-page'> / {currentMaxPage}</span>
                  {currentPage < currentMaxPage && (
                    <img
                      alt="->"
                      src='assets/forward.svg'
                      className="arrow"
                      onClick={() => changePage(currentSrc, currentPage + 1)}
                    />
                  )}
                </div>
              )}

              
            </div>
          </div>
        )
      }

    </div>
  );
}

export default App;

