# Fi_taxon_in.R
#'
#' @title Checks if a taxon is in 'Flora iberica'
#'
#' @description Checks if a name is in the 'Flora iberica' checklist, reading from http://www.floraiberica.es.
#'
#' @param genus A `character` with a generic taxon name.
#' @param epithet A `character` with an specific epithet name.
#' @param infra A `character` with an infraspecific name.
#' @param infrarank A `character` with the rank of the infraspecific name.
#'
#' @details This function reads from http://www.floraiberica.es and checks if a given taxon is present in the 'Flora iberica' checklist.
#'
#' @return A `vector` with three components. The first component ('accepted.in.Fi')
#' is `TRUE` if the searched taxon is accepted in 'Flora iberica'; is `FALSE` if the
#' searched taxon is not accepted in Flora iberica' (e.g. is a synonym), or is
#' mistyped, or out of 'Flora iberica' scope; is `NA` for the infrageneric taxa
#' belonging to a not yet published genus. A second component ('message') gives
#' further information to the user. Finally, a third component ('rank'), returns
#' the rank of the name.
#'
#' @author Tiago Monteiro-Henriques. E-mail: \email{tmh.dev@@icloud.com}.
#'
#' @export
#'
Fi_taxon_in <- function(genus, epithet = NULL, infra = NULL, infrarank = NULL) {
  if (is.null(genus)) {stop("Argument genus can not be NULL.")}
  if (!is.null(infra) & is.null(infrarank)) {stop("An infraspecific name was given, but not an infrasepcific rank.")}
  if (is.null(infra) & !is.null(infrarank)) {stop("An infraspecific rank was given, but not an infrasepcific name.")}
  #TEST infrarank c("subsp.", "var.") #Check how forms are treated! Some forms don't seem recognized... at least in the webpage...
  #Fi_result <- readLines(paste0("http://www.floraiberica.es/PHP/cientificos_.php?gen=", genus), encoding="latin1", warn=FALSE) #It is not necessary ","&espe=", epithet, "&infra=", infra" #"latin1" seems to work in some cases, but not in other cases...
  Fi_result <- readLines(paste0("http://www.floraiberica.es/PHP/cientificos_.php?gen=", genus), warn=FALSE) #It is not necessary ","&espe=", epithet, "&infra=", infra"
  if (any(grepl("taxon extraiberico o mal escrito", Fi_result))) {
    #TODO: In future: check if it is a synonym in Fi!
    return(c(accepted.in.Fi=FALSE, message="Taxon not accepted in Fi (synonym), or is mistyped, or out of Fi scope.", rank=NA)) #PODE TENTAR MELHORAR-SE O CASO
  }
  if (any(grepl("por desarrollar", Fi_result))) {
    if (is.null(epithet) & is.null(infra)) {
      return(c(accepted.in.Fi=TRUE, message="Taxon accepted in Fi but not published still.", rank="genus"))
    } else {
      return(c(accepted.in.Fi=NA, message="Infrageneric taxon belonging to a not yet published genus.", rank=NA))
    }
  }
  i <- grep("HREF =cientificos2.php\\?gen", Fi_result) #finds index of element with relevant names
  if (length(i)==0) {stop("Unexpected result: could not find any name, and usual message returned by Flora iberica to absent/mistyped names was not found either. Something went wrong. Please check code.")}
  if (is.null(epithet) & is.null(infra)) {
    return(c(accepted.in.Fi=TRUE, message="Taxon accepted in Fi and published.", rank="genus"))
  }
  temp1 <- strsplit(Fi_result[i], "</font>&nbsp;&nbsp;</dt><dt>")
  temp2 <- lapply(temp1, gsub, pattern="<b><i> </b></i>", replacement="")
  temp3 <- unlist(lapply(temp2, gsub, pattern="<i> </i>", replacement=""))
  temp4 <- unlist(lapply(temp3, function (x) {
    if (grepl(" x ", x)) {
      return(strsplit(x, "</a></dt>"))
    } else {return(x)}
  }))
  temp5 <- unlist(lapply(temp4, clean_stuff, stuff = c("<([^<>]*)>", "&nbsp;", "\t")))
  temp6 <- unlist(lapply(temp5, clean_whitespaces))
  temp7 <- temp6[!sapply(temp6, is.null)]
  temp8 <- temp7[!temp7==""]
  res <- unlist(lapply(temp8, function (x) {
    if (grepl(" x ", x)) {return(x)}
    if (grepl(", ", x)) {
      spl_ind <- regexpr(", ", x)
      if (spl_ind==-1) {return(x)}
      return(substr(x, 1, spl_ind-1))
    }
    if (grepl(" in ", x)) {
      spl_ind <- regexpr(" in ", x)
      if (spl_ind==-1) {return(x)}
      return(substr(x, 1, spl_ind-1))
    }
    return(x)
  }))

  #obtaining the genus abbreviation in use
  ind1 <- regexpr("^.{1,2}\\.", res[2]) #It assumes the second line begins always with the abbreviation of the genus.
  if (ind1==-1) {stop("Code assumes there is always an abbreviated genus name in the second line of the taxa list. That is failing. Check code and possibly recode accordingly.")}
  leng <- attributes(ind1)$match.length
  abbr <- substr(res[2], 1, leng)
  abbrev <- sub("\\.","\\\\\\.", abbr) #attention, hibrids might have a different abbreviations (as e.g. in Cheilanthes)

  condition1 <- sapply(res, grepl, pattern=paste0(abbrev, " ", epithet))
  if (all(!condition1)) {return(c(accepted.in.Fi=FALSE, message="Taxon not accepted in Fi, or is mistyped, or is a synonym.", rank="species"))}
  if (is.null(infra)) {
    if (any(condition1)) {return(c(accepted.in.Fi=TRUE, message="Taxon accepted in Fi and published.", rank="species"))}
  }
  condition2 <- sapply(res, grepl, pattern=paste0(abbrev, " ", epithet)) & sapply(res, grepl, pattern=infra) & sapply(res, grepl, pattern=infrarank)
  if (all(!condition2)) {return(c(accepted.in.Fi=FALSE, message="Taxon (species or infraspecific) not accepted in Fi, or is mistyped, or is a synonym.", rank=NA))}
  if (any(condition2)) {return(c(accepted.in.Fi=TRUE, message="Taxon accepted in Fi and published.", rank=infrarank))}
  stop("Unexpected result, something went wrong. Check code.")
}

